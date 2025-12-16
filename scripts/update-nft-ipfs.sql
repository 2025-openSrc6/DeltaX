-- Update NFT image URLs to IPFS CIDs
-- Obsidian Tier NFTs
UPDATE shop_items SET image_url = 'ipfs://bafybeihhwd3ivt5k6s6qnj3yscm3wtretf2bzdmostflwicfar4t6vmcjy' WHERE id LIKE '%obsidian%' AND name LIKE '%호랑이%' OR id = 'nft_obsidian';
UPDATE shop_items SET image_url = 'ipfs://bafybeihowygs5i6n7tdazn2wrhhwz2nrwobgtjsn57y6gkj7ypezjguh7i' WHERE id LIKE '%obsidian%' AND name LIKE '%두루미%';
UPDATE shop_items SET image_url = 'ipfs://bafybeiglrknmrxo3jm4g3nveqvxv6n4sozp3y32ib7cxik3ammjsmpryf4' WHERE id LIKE '%obsidian%' AND name LIKE '%반달%';
UPDATE shop_items SET image_url = 'ipfs://bafybeifxzkgrd2klnv5y65qza6gswcejzrg24kued3k6is2sgofbtligxy' WHERE id LIKE '%obsidian%' AND name LIKE '%쌍%';
UPDATE shop_items SET image_url = 'ipfs://bafybeigijtniqm2azxpdhs2pywytnw6tlvjcqz6xyqtz74tputmxnz2qoa' WHERE id LIKE '%obsidian%' AND name LIKE '%수달%';

-- Aurum Tier NFTs
UPDATE shop_items SET image_url = 'ipfs://bafybeic7y5qkv34fclloygbntzf63tbdzvhlarrdnt7sn6opvucmlc3pze' WHERE id LIKE '%aurum%' AND name LIKE '%백호%';
UPDATE shop_items SET image_url = 'ipfs://bafybeihfdmhzmkqzomzq3s2jvy2o7pjtshnhx63wwd5y66j7hrh2ftsysi' WHERE id LIKE '%aurum%' AND name LIKE '%청룡%' OR id = 'nft_aurum';
UPDATE shop_items SET image_url = 'ipfs://bafybeieruflmccrv44haggwfjpryfytcupcspmxzogwc2vlod3daun6zou' WHERE id LIKE '%aurum%' AND name LIKE '%주작%';
UPDATE shop_items SET image_url = 'ipfs://bafybeicddiccbudqjtblgkfs4fgm7so3vciljx26rmaioc3nr5dlvwwkwu' WHERE id LIKE '%aurum%' AND name LIKE '%현무%';

-- Nova Tier NFTs
UPDATE shop_items SET image_url = 'ipfs://bafybeibsxr6ztbo6fushzmmqpwptddxtam5oimvnamuntqfhzoajsqi3aa' WHERE id LIKE '%nova%' AND name LIKE '%천%' OR id = 'nft_nova';
UPDATE shop_items SET image_url = 'ipfs://bafybeifo2iw4nyynamdohbl45vtb4pkc3puqyhwxdds63jt3s7hhbigpj4' WHERE id LIKE '%nova%' AND name LIKE '%지%';
UPDATE shop_items SET image_url = 'ipfs://bafybeidx2vv3fiepz4z5m7nwabpcucq5hvhotshwrmgvfssln7dfllolfi' WHERE id LIKE '%nova%' AND name LIKE '%인%';

-- Aetherion Tier NFTs
UPDATE shop_items SET image_url = 'ipfs://bafybeidkisur3ziwdnicakyhcuaxejlbnyonb4t4xnhmobjl7inkny24ea' WHERE id LIKE '%aetherion%' AND name LIKE '%태극%' OR id = 'nft_aetherion';
UPDATE shop_items SET image_url = 'ipfs://bafybeigyo56qmbtrzj4vprk4rh5x5ausiyemjgsxjvfvocbsfam6bwqv6u' WHERE id LIKE '%aetherion%' AND name LIKE '%무극%';

-- Singularity Tier NFTs
UPDATE shop_items SET image_url = 'ipfs://bafybeih6qzbs2dfazjxvh35ndc6aoatbpb2ilxryhpm2gl27lslx6uypry' WHERE id LIKE '%singularity%' OR id = 'nft_singularity';
