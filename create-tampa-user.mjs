// supabase/create-tampa-user.mjs
//
// Creates the Tampa manager login and links it to the Tampa location (LOC12).
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=<key-from-dashboard> node supabase/create-tampa-user.mjs
//
// Get the key from:
//   https://supabase.com/dashboard/project/nlhisfbcrbkalxtxmsbn/settings/api
//   → "service_role" key (secret — never expose publicly)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nlhisfbcrbkalxtxmsbn.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL    = 'hbktampa@gmail.com';
const PASSWORD = 'tampa@hbk123';
const ROLE     = 'manager';
const LOC_CODE = 'LOC12';

if (!SERVICE_ROLE_KEY) {
  console.error('❌  Set SUPABASE_SERVICE_ROLE_KEY environment variable.');
  console.error('   Get it from: https://supabase.com/dashboard/project/nlhisfbcrbkalxtxmsbn/settings/api');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Look up Tampa location id
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('id, name')
    .eq('code', LOC_CODE)
    .single();

  if (locErr || !loc) {
    console.error('❌  Tampa location (LOC12) not found. Run the SQL migration first:\n');
    console.error("    insert into public.locations (code, name, address)");
    console.error("    values ('LOC12', 'Tampa', '1200 N Franklin St, Tampa, FL')");
    console.error("    on conflict (code) do nothing;");
    process.exit(1);
  }

  console.log(`✅  Found location: ${loc.name} (${loc.id})`);

  // 2. Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (authErr) {
    console.error('❌  Failed to create auth user:', authErr.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`✅  Created auth user: ${EMAIL} (${userId})`);

  // 3. Create user_profiles row linked to Tampa
  const { error: profileErr } = await supabase
    .from('user_profiles')
    .insert({
      user_id:     userId,
      username:    'hbktampa',
      role:        ROLE,
      location_id: loc.id,
    });

  if (profileErr) {
    console.error('❌  Failed to create user_profiles row:', profileErr.message);
    process.exit(1);
  }

  console.log(`✅  Created profile: role=${ROLE}, location=${loc.name}`);
  console.log('');
  console.log('🎉  Tampa login ready!');
  console.log(`    Email:    ${EMAIL}`);
  console.log(`    Password: ${PASSWORD}`);
  console.log(`    Role:     ${ROLE}`);
  console.log(`    Location: ${loc.name}`);
}

main();
