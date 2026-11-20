# Local deployment secrets

Create the API key file before starting Compose:

```bash
mkdir -p secrets
umask 077
printf '%s' 'PASTE_THE_PFSENSE_API_KEY_HERE' > secrets/pfsense_api_key
chmod 600 secrets/pfsense_api_key
```

Replace the placeholder locally. Never commit this file. The API container receives it read-only at /run/secrets/pfsense_api_key. Do not paste the key into chat, source code, Compose environment variables, or logs.
