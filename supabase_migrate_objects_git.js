// npm install @supabase/supabase-js@1
/*

    This is the script that is working to copy also the storage object from one project to another one.
    from here https://gist.github.com/Ellba/654306645735b4e8d4974a0f756be61b
    remember to use the service_role key!!!

*/
const { createClient } = require('@supabase/supabase-js')

const OLD_PROJECT_URL = '[your project url]'
const OLD_PROJECT_SERVICE_KEY = '[your project anon key]'

const NEW_PROJECT_URL = '[your project url]'
const NEW_PROJECT_SERVICE_KEY = '[your project anon key]'

const oldSupabase = createClient(OLD_PROJECT_URL, OLD_PROJECT_SERVICE_KEY)
const newSupabase = createClient(NEW_PROJECT_URL, NEW_PROJECT_SERVICE_KEY)

const fs = require('fs');
const path = require('path');

// List of buckets to exclude from migration
const EXCLUDED_BUCKETS = [
  'tempUpload'
  // Add more bucket names as needed
];

// Create a log file stream
const logFile = fs.createWriteStream(path.join(__dirname, 'migration.log'), { flags: 'a' });

// Custom logger function that writes to both console and file
function log(message, isError = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  if (isError) {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
  
  // Write to the log file
  logFile.write(logMessage + '\n');
}

/**
 * Lists all files in a bucket, handling nested folders recursively.
 */
async function listAllFiles(bucket, path = '') {
  const { data, error } = await oldSupabase.storage.from(bucket).list(path, { limit: 1000 })
  if (error) {
    const errorMsg = `❌ Error listing files in bucket '${bucket}': ${error.message}`;
    log(errorMsg, true);
    throw new Error(errorMsg);
  }

  let files = []
  for (const item of data) {
    if (!item.metadata) {
      // Folder - recurse
      const subFiles = await listAllFiles(bucket, `${path}${item.name}/`)
      files = files.concat(subFiles)
    } else {
      // File
      files.push({ fullPath: `${path}${item.name}`, metadata: item.metadata })
    }
  }
  return files
}

/**
 * Creates a bucket in the new Supabase project if it doesn't exist.
 */
async function ensureBucketExists(bucketName) {
  const { data: existingBucket } = await newSupabase.storage.getBucket(bucketName)
  if (!existingBucket) {
    log(`🪣 Creating bucket '${bucketName}' in new project...`)
    const { error } = await newSupabase.storage.createBucket(bucketName)
    if (error) {
      const errorMsg = `❌ Failed to create bucket '${bucketName}': ${error.message}`;
      log(errorMsg, true);
      throw new Error(errorMsg);
    }
  }
}

/**
 * Migrates a single file from the old project to the new one.
 */
async function migrateFile(bucketName, file) {
  try {
    const { data, error: downloadError } = await oldSupabase.storage.from(bucketName).download(file.fullPath)
    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`)

    const { error: uploadError } = await newSupabase.storage.from(bucketName).upload(file.fullPath, data, {
      upsert: true,
      contentType: file.metadata?.mimetype,
      cacheControl: file.metadata?.cacheControl,
    })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    log(`✅ Successfully migrated ${file.fullPath} in bucket '${bucketName}'`)
  } catch (err) {
    log(`❌ Error migrating ${file.fullPath} in bucket '${bucketName}': ${err.message}`, true)
  }
}

/**
 * Splits an array into smaller chunks of a given size.
 */
function chunkArray(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Migrates all buckets and files from the old Supabase project to the new one.
 * Limits concurrent file uploads using batch processing (10 files at a time).
 */
async function migrateBuckets() {
  log('📦 Fetching all buckets from old project...')
  const { data: oldBuckets, error: bucketListError } = await oldSupabase.storage.listBuckets()
  
  if (bucketListError) {
    const errorMsg = `❌ Error fetching buckets: ${bucketListError.message}`;
    log(errorMsg, true);
    throw new Error(errorMsg);
  }
  
  // Filter out excluded buckets
  const bucketsToMigrate = oldBuckets.filter(bucket => !EXCLUDED_BUCKETS.includes(bucket.name));
  const excludedCount = oldBuckets.length - bucketsToMigrate.length;
  
  log(`✅ Found ${oldBuckets.length} buckets in total.`);
  if (excludedCount > 0) {
    log(`ℹ️ Excluding ${excludedCount} bucket(s): ${EXCLUDED_BUCKETS.filter(b => oldBuckets.some(ob => ob.name === b)).join(', ')}`);
  }
  log(`🚀 Will migrate ${bucketsToMigrate.length} bucket(s).`)

  for (const bucket of bucketsToMigrate) {
    const bucketName = bucket.name
    log(`📁 Processing bucket: ${bucketName}`)

    // Ensure the bucket exists in the new project
    await ensureBucketExists(bucketName)

    const files = await listAllFiles(bucketName)
    log(`✅ Found ${files.length} files in bucket '${bucketName}'.`)

    // Split files into batches of 10 to limit parallel requests
    const batches = chunkArray(files, 10)
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      log(`🚀 Processing batch ${i + 1}/${batches.length} (${batch.length} files)`)
      
      // Process each batch in parallel, limiting concurrency
      await Promise.all(batch.map(file => migrateFile(bucketName, file)))
      
      log(`✅ Completed batch ${i + 1}/${batches.length}`)
    }
  }
}

// Run migration and handle top-level errors
migrateBuckets()
  .then(() => {
    log('✅ Migration completed successfully!')
    logFile.end() // Close the log file stream
  })
  .catch(err => {
    log(`❌ Fatal error during migration: ${err.message}`, true)
    logFile.end() // Close the log file stream
    process.exit(1)
  })