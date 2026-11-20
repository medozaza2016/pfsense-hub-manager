Create the API key file before starting Compose:

```bash
mkdir -p secrets
umask 077
printf '%s' 'PASTE_THE_PFSENSE_API_KEY_HERE' > secrets/pfsense_api_key
chown 1000:1000 secrets/pfsense_api_key
chmod 400 secrets/pfsense_api_key
```
Replace the placeholder locally. The API container runs as UID 1000, so make the secret readable by that UID. This file is git-ignored and mounted read-only at /run/secrets/pfsense_api_key. Never commit or paste the key into source code or logs.
