// migration of the storage policies


// Requires the pg library: npm install pg
const { Pool } = require('pg');
const fs = require('fs');

// Source database connection
const sourcePool = new Pool({
  connectionString: 'postgresql://postgres.[your project id]:[your passsord]Q@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

// Destination database connection
const destPool = new Pool({
  connectionString: 'postgresql://postgres.[your project id]:[your passsord]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});


async function exportStoragePolicies() {
  const client = await sourcePool.connect();
  try {
    // Query to get all storage bucket policies
    const policiesResult = await client.query(`
      SELECT
        p.tablename,
        p.policyname,
        p.roles,
        p.cmd,
        p.qual,
        p.with_check
      FROM
        pg_policies p
      JOIN
        pg_class c ON p.tablename = c.relname
      JOIN
        pg_namespace n ON c.relnamespace = n.oid
      WHERE
        n.nspname = 'storage'
    `);
    
    // Save policies to a JSON file
    const policies = policiesResult.rows;
    fs.writeFileSync('storage_policies.json', JSON.stringify(policies, null, 2));
    console.log(`Exported ${policies.length} storage policies to storage_policies.json`);
    
    return policies;
  } finally {
    client.release();
  }
}

async function importStoragePolicies(policies) {
  const client = await destPool.connect();
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Apply each policy
    for (const policy of policies) {
      const { tablename, policyname, roles, cmd, qual, with_check } = policy;
      
      // First drop any existing policy with the same name (to avoid conflicts)
      try {
        await client.query(`
          DROP POLICY IF EXISTS "${policyname}" ON storage."${tablename}"
        `);
      } catch (e) {
        console.warn(`Warning dropping policy ${policyname}: ${e.message}`);
      }
      
      // Create the policy
      try {
        // Process the roles - convert from PostgreSQL array format {role1,role2} to SQL role list
        // Remove the curly braces and split by comma
        const rolesProcessed = roles
          .replace('{', '')
          .replace('}', '')
          .split(',')
          .map(role => role.trim())
          .join(', ');
        
        // Construct the CREATE POLICY command
        let createPolicySQL = `
          CREATE POLICY "${policyname}" 
          ON storage."${tablename}"
          FOR ${cmd}
          TO ${rolesProcessed}
        `;
        
        if (qual) {
          createPolicySQL += ` USING (${qual})`;
        }
        
        if (with_check) {
          createPolicySQL += ` WITH CHECK (${with_check})`;
        }
        
        await client.query(createPolicySQL);
        console.log(`Created policy: ${policyname} on ${tablename}`);
      } catch (e) {
        console.error(`Error creating policy ${policyname}: ${e.message}`);
      }
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log('All policies imported successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error importing policies:', e);
  } finally {
    client.release();
  }
}

// For debugging: Print a sample policy to see its structure
async function debugPolicyStructure() {
  try {
    // Check if the file exists first
    if (fs.existsSync('storage_policies.json')) {
      const policies = JSON.parse(fs.readFileSync('storage_policies.json', 'utf8'));
      if (policies.length > 0) {
        console.log('Sample policy structure:');
        console.log(JSON.stringify(policies[0], null, 2));
        console.log(`'roles' type: ${typeof policies[0].roles}`);
        console.log(`'roles' value: ${policies[0].roles}`);
      }
    } else {
      // If no file exists, export policies first
      const policies = await exportStoragePolicies();
      if (policies.length > 0) {
        console.log('Sample policy structure:');
        console.log(JSON.stringify(policies[0], null, 2));
        console.log(`'roles' type: ${typeof policies[0].roles}`);
        console.log(`'roles' value: ${policies[0].roles}`);
      }
    }
  } catch (err) {
    console.error('Error in debug function:', err);
  }
}

// Run the migration
async function migrateStoragePolicies() {
  try {
    // First run debug to see the structure
    await debugPolicyStructure();
    
    // Export policies (if not already done in debug)
    const policies = fs.existsSync('storage_policies.json') 
      ? JSON.parse(fs.readFileSync('storage_policies.json', 'utf8'))
      : await exportStoragePolicies();
    
    // Add error handling in case any policies fail
    let successCount = 0;
    let failCount = 0;
    
    // Import policies one by one with individual transaction handling
    for (const policy of policies) {
      try {
        const client = await destPool.connect();
        try {
          await client.query('BEGIN');
          
          const { tablename, policyname, roles, cmd, qual, with_check } = policy;
          
          // First drop any existing policy with the same name
          await client.query(`
            DROP POLICY IF EXISTS "${policyname}" ON storage."${tablename}"
          `);
          
          // Process the roles - convert from PostgreSQL array format {role1,role2} to SQL role list
          const rolesProcessed = roles
            .replace('{', '')
            .replace('}', '')
            .split(',')
            .map(role => role.trim())
            .join(', ');
          
          // Construct the CREATE POLICY command
          let createPolicySQL = `
            CREATE POLICY "${policyname}" 
            ON storage."${tablename}"
            FOR ${cmd}
            TO ${rolesProcessed}
          `;
          
          if (qual) {
            createPolicySQL += ` USING (${qual})`;
          }
          
          if (with_check) {
            createPolicySQL += ` WITH CHECK (${with_check})`;
          }
          
          await client.query(createPolicySQL);
          await client.query('COMMIT');
          console.log(`✅ Created policy: ${policyname} on ${tablename}`);
          successCount++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`❌ Error creating policy ${policy.policyname}: ${err.message}`);
          failCount++;
        } finally {
          client.release();
        }
      } catch (connectionErr) {
        console.error(`Failed to get client from pool: ${connectionErr.message}`);
        failCount++;
      }
    }
    
    console.log(`Migration complete: ${successCount} policies imported successfully, ${failCount} failed`);
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    // Close pools
    sourcePool.end();
    destPool.end();
  }
}

migrateStoragePolicies();