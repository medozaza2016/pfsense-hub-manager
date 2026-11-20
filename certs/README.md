# Private CA trust

If the firewall API certificate is issued by a private CA, place the CA certificate at certs/pfsense-ca.pem and set PFSENSE_CA_FILE=/run/certs/pfsense-ca.pem in .env. Compose mounts this directory read-only into the API container. The certificate must validate the hostname or IP address in PFSENSE_API_BASE_URL. Never use a TLS verification bypass.
