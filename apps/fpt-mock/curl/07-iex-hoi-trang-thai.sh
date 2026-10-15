curl --location 'http://localhost:7070/api/IEX' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {{token}}' \
--data '{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "BI820001",
    "password": "12345678",
    "terminaL_ID": "Z0000M",
    "terminaL_ACCESS_KEY": "MOCKTERMINALKEY0"
  },
  "tK_SOTK": "{{soToKhai}}"
}'
