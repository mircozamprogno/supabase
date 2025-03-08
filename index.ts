import { serve } from 'https://deno.land/std@0.182.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.14.0';
import { corsHeaders } from '../_shared/cors.ts';

console.log("Delete user account function");

serve(async (request) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log("This is the user to delete");
  console.log(request.headers.get('myuserid')!);

  try {
    // Log environment variables and request headers for debugging
    console.log('SB URL:', Deno.env.get('SUPABASE_URL'));
    console.log('SB ANON KEY available:', !!Deno.env.get('SUPABASE_ANON_KEY'));
    console.log('SB SERVICE ROLE KEY available:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    
    const authHeader = request.headers.get('Authorization');
    console.log('Auth header length:', authHeader ? authHeader.length : 0);

    // Extract the JWT token (remove the "Bearer " prefix if present)
    let jwtToken = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwtToken = authHeader.substring(7);
      console.log('Token extracted, length:', jwtToken.length);
      
      // Try to decode parts to verify it's a valid JWT
      try {
        const parts = jwtToken.split('.');
        if (parts.length === 3) {
          const header = JSON.parse(atob(parts[0]));
          const payload = JSON.parse(atob(parts[1]));
          console.log('Token format valid. Algorithm:', header.alg);
          console.log('Payload contains sub:', !!payload.sub);
          console.log('Token expires at:', new Date(payload.exp * 1000).toISOString());
        } else {
          console.log('Invalid token format - does not have 3 parts');
        }
      } catch (e) {
        console.log('Error decoding token parts:', e.message);
      }
    } else {
      console.log('No Bearer token found in Authorization header');
      return new Response(JSON.stringify({ error: 'No Bearer token provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Create a supabase client using the anon key first
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '' // Using anon key
    );
    
    // Get user with explicit token parameter
    console.log('Getting user with explicit token parameter...');
    const { data, error } = await supabaseAnon.auth.getUser(jwtToken);
    
    console.log("Auth data:", data ? JSON.stringify(data) : "No data");
    console.log("Auth error:", error ? JSON.stringify(error) : "No error");
    
    if (error) {
      console.log("Error getting user:", error.message);
      throw new Error(`Authentication error: ${error.message}`);
    }
    
    if (!data?.user) {
      console.log("No user found in auth data");
      throw new Error('No user found for JWT!');
    }
    
    const userId = data.user.id;
    console.log("User ID found:", userId);
    
    // Create admin client with service role key for deletion
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Attempt to delete the user
    console.log("Attempting to delete user:", userId);
    const { data: deletion_data, error: deletion_error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    console.log("Deletion response:", deletion_error ? "Error" : "Success");
    if (deletion_error) {
      console.log("Deletion error:", JSON.stringify(deletion_error));
      throw new Error(`User deletion failed: ${deletion_error.message}`);
    }
    
    console.log("User deleted successfully!");
    
    // Return a response of the user which has been deleted
    return new Response(JSON.stringify({ 
      message: 'User deleted successfully', 
      data: deletion_data 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    // Return an error with the error message
    console.log("Final error caught:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});