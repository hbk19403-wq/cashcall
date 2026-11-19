-- Close public access to trial_invites.
--
-- APPLY ONLY AFTER the site is deployed with the service-role versions of
-- /api/invites/validate and /api/invites/claim. Applying it earlier breaks invite links.
--
-- Before: any visitor (the public "anon" key is enough) could list every unused, unexpired invite
-- with its key and email, and any signed-in user could mark any unused invite as used.
-- After: invites are read and claimed only through the server routes, which look up one exact key.
-- Kept: users can still read invites addressed to their own email (the middleware's trial-expiry
-- check relies on it), and the admin policies are unchanged.

drop policy if exists "public_read_valid_invite"  on public.trial_invites;
drop policy if exists "authenticated_claim_invite" on public.trial_invites;
