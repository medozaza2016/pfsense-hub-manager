Create the API key file before starting Compose:

```bash
mkdir -p secrets
umask 077
printf '%s' 'PASTE_THE_PFSENSE_API_KEY_HERE' > secrets/pfsense_api_key
chmod 600 secrets/pfsense_api_key
```
Replace the placeholder locally. This file is git-ignored and mounted read-only at /run/secrets/pfsense_api_key. Never commit or paste the key into source code or logs.
