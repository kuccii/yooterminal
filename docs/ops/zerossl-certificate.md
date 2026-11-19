# ZeroSSL Certificate Swap Runbook

**Date issued:** 2026-11-20
**Cert name:** `www.yooterminal.com-zerossl`
**Leaf fingerprint (SHA-256):** `F8:10:4E:DB:71:5C:F9:E0:5D:85:B4:A0:8D:5D:DE:89:29:2B:46:BC:E1:6E:F5:38:C4:25:5F:05:27:CB:21:96`
**Intermediate fingerprint (SHA-256):** `EC:9D:6B:CA:B9:81:8B:7D:D5:9E:D6:1D:A2:3A:65:8A:96:A9:C4:E9:50:ED:EE:0D:2D:A9:3E:7C:F2:17:47:80`
**Serial (leaf):** `A1441CA4E8A28A4339172CDFB8B46B9A`
**Serial (intermediate):** `D0A908255F8E50E5F3396D1114702A37`
**Expires:** 2027-02-17 23:59:59 GMT
**Key type:** RSA 2048
**Chain:** leaf → ZeroSSL RSA DV SSL CA 2 → Sectigo Public Server Authentication Root R46 → USERTrust RSA Certification Authority

## Verification Commands

```bash
# 1. Live chain subjects
echo | openssl s_client -connect www.yooterminal.com:443 -servername www.yooterminal.com -showcerts 2>/dev/null | grep -E '^ *[0-9]+ s:|^ *i:' | head -8

# 2. Leaf issuer + public key algorithm
echo | openssl s_client -connect www.yooterminal.com:443 -servername www.yooterminal.com 2>/dev/null | openssl x509 -noout -issuer -text | grep -E 'Issuer:|Public Key Algorithm'

# 3. Expiry
echo | openssl s_client -connect www.yooterminal.com:443 -servername www.yooterminal.com 2>/dev/null | openssl x509 -noout -dates

# 4. Local file verification
openssl x509 -in /etc/letsencrypt/live/www.yooterminal.com-zerossl/cert.pem -noout -issuer -fingerprint -sha256
openssl verify -CAfile /etc/letsencrypt/live/www.yooterminal.com-zerossl/fullchain.pem /etc/letsencrypt/live/www.yooterminal.com-zerossl/cert.pem
```

Expected output (abbreviated):
```
 0 s:CN = www.yooterminal.com
   i:C = AT, O = ZeroSSL GmbH, CN = ZeroSSL RSA DV SSL CA 2
 1 s:C = AT, O = ZeroSSL GmbH, CN = ZeroSSL RSA DV SSL CA 2
   i:C = GB, O = Sectigo Limited, CN = Sectigo Public Server Authentication Root R46
 2 s:C = GB, O = Sectigo Limited, CN = Sectigo Public Server Authentication Root R46
   i:C = US, ST = New Jersey, L = Jersey City, O = The USERTRUST Network, CN = USERTrust RSA Certification Authority
...
        Issuer: C = AT, O = ZeroSSL GmbH, CN = ZeroSSL RSA DV SSL CA 2
            Public Key Algorithm: rsaEncryption
notBefore=Nov 19 00:00:00 2026 GMT
notAfter=Feb 17 23:59:59 2027 GMT
```

## Device Gate (Android 6 / Sunmi V1)

**Status:** BLOCKED — no V1 device attached via adb at time of execution.

### Required Manual Test
On the Sunmi V1 device (Android 6.0):
1. Open browser → `https://www.yooterminal.com/api/health` → expect `{"ok":true,"time":"..."}` with **no certificate warning**.
2. Open browser → `https://www.yooterminal.com/pos/` → POS install page renders, no TLS error.

If either fails → restore backup (see below) and report exact error.

## Rollback Procedure

```bash
# On production server (root@72.60.188.94):
tar -xzf /root/nginx-backup-2026-11-20-0021.tar.gz -C /
nginx -t && systemctl reload nginx

# Verify fallback to Let's Encrypt EC cert:
echo | openssl s_client -connect www.yooterminal.com:443 -servername www.yooterminal.com 2>/dev/null | openssl x509 -noout -issuer | grep "Let's Encrypt"
```

## Rotation Reminder

- This cert auto-renews via certbot timer (`certbot.timer` active).
- Renewal config: `/etc/letsencrypt/renewal/www.yooterminal.com-zerossl.conf` (server = `https://acme.zerossl.com/v2/DV90`, RSA 2048).
- Next rotation: before **2027-01-18** (30 days before expiry).
- To rotate manually: repeat Steps 2–5 of Task 0 with a fresh EAB request.
- **ZeroSSL access key** is a production secret — never commit it, never write to disk outside `/root/.zerossl-key` (mode 600).
- The runbook does **not** contain the access key.

## Files Changed on Server

- `/root/.zerossl-key` (mode 600, contains access key)
- `/root/.zerossl-eab.json` (EAB credentials, ephemeral)
- `/etc/letsencrypt/live/www.yooterminal.com-zerossl/` (new cert + chain)
- `/etc/nginx/conf.d/yooterminal.conf` (two server blocks updated: www + apex)
- certbot renewal timer unchanged

## Backup

`/root/nginx-backup-2026-11-20-0021.tar.gz` (full `/etc/nginx` snapshot pre-change)