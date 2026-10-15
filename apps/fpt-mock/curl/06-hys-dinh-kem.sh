curl --location 'http://localhost:7070/api/HYS' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer {{token}}' \
--data '{
  "objVNACCS_ACCOUNT": {
    "useR_ID": "BI820001",
    "password": "12345678",
    "terminaL_ID": "Z0000M",
    "terminaL_ACCESS_KEY": "MOCKTERMINALKEY0"
  },
  "tK_CH": "88AB",
  "tK_CHB": "00",
  "tK_TSB": "A99",
  "tK_REF": "{{soToKhai}}",
  "lisT_FILE": [
    {
      "filE_NAME": "invoice.pdf",
      "filE_BASE64": "JVBERi0xLjQgZmlsZSBtYXU="
    }
  ]
}'
