#!/bin/bash
# Refresh the wrangler OAuth token (1h lifetime). Run when wrangler errors with code 7403.
set -e
REFRESH=$(python3 -c "
import re
print(re.search(r'refresh_token = \"([^\"]+)\"', open('$HOME/.wrangler/config/default.toml').read()).group(1))")
curl -s -X POST https://dash.cloudflare.com/oauth2/token \
  -d "grant_type=refresh_token" -d "refresh_token=$REFRESH" \
  -d "client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7" | python3 -c "
import json, sys, datetime, os, re
d = json.load(sys.stdin)
assert 'access_token' in d, d
expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=int(d['expires_in']))).isoformat()
path = os.path.expanduser('~/.wrangler/config/default.toml')
t = open(path).read()
t = re.sub(r'oauth_token = \"[^\"]+\"', f'oauth_token = \"{d[\"access_token\"]}\"', t)
if 'refresh_token' in d:
    t = re.sub(r'refresh_token = \"[^\"]+\"', f'refresh_token = \"{d[\"refresh_token\"]}\"', t)
t = re.sub(r'expiration_time = \"[^\"]+\"', f'expiration_time = \"{expiry}\"', t)
open(path,'w').write(t)
print('refreshed, expires', expiry)
"
