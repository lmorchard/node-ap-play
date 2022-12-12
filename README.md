# node-ap-play

This is a pile of node code playing with ActivityPub

## generating actor keys

```
openssl genpkey -out private.pem -algorithm RSA -pkeyopt rsa_keygen_bits:2048
openssl pkey -in private.pem -pubout -out public.pem 
mv *.pem actors/complimentron/
```
