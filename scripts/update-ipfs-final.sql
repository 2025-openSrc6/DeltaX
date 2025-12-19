-- Update otter obsidian (based on log showing it was purchased)
UPDATE shop_items SET image_url = 'ipfs://bafybeigijtniqm2azxpdhs2pywytnw6tlvjcqz6xyqtz74tputmxnz2qoa' WHERE id = 'nft_obsidian_otter';

-- Other obsidian tier
UPDATE shop_items SET image_url = 'ipfs://bafybeihhwd3ivt5k6s6qnj3yscm3wtretf2bzdmostflwicfar4t6vmcjy' WHERE id LIKE '%tiger%' AND id LIKE '%obsidian%';
UPDATE shop_items SET image_url = 'ipfs://bafybeihowygs5i6n7tdazn2wrhhwz2nrwobgtjsn57y6gkj7ypezjguh7i' WHERE id LIKE '%crane%' AND id LIKE '%obsidian%';
UPDATE shop_items SET image_url = 'ipfs://bafybeiglrknmrxo3jm4g3nveqvxv6n4sozp3y32ib7cxik3ammjsmpryf4' WHERE id LIKE '%bear%' AND id LIKE '%obsidian%';
UPDATE shop_items SET image_url = 'ipfs://bafybeifxzkgrd2klnv5y65qza6gswcejzrg24kued3k6is2sgofbtligxy' WHERE id LIKE '%ssang%' AND id LIKE '%obsidian%';

-- Aurum tier  
UPDATE shop_items SET image_url = 'ipfs://bafybeic7y5qkv34fclloygbntzf63tbdzvhlarrdnt7sn6opvucmlc3pze' WHERE id LIKE '%white%tiger%' OR id LIKE '%aurum%baekho%';
UPDATE shop_items SET image_url = 'ipfs://bafybeihfdmhzmkqzomzq3s2jvy2o7pjtshnhx63wwd5y66j7hrh2ftsysi' WHERE id LIKE '%dragon%' OR id LIKE '%aurum%cheongryong%';
UPDATE shop_items SET image_url = 'ipfs://bafybeieruflmccrv44haggwfjpryfytcupcspmxzogwc2vlod3daun6zou' WHERE id LIKE '%bird%' OR id LIKE '%aurum%jujak%';
UPDATE shop_items SET image_url = 'ipfs://bafybeicddiccbudqjtblgkfs4fgm7so3vciljx26rmaioc3nr5dlvwwkwu' WHERE id LIKE '%turtle%' OR id LIKE '%aurum%hyeonmu%';

-- Nova tier
UPDATE shop_items SET image_url = 'ipfs://bafybeibsxr6ztbo6fushzmmqpwptddxtam5oimvnamuntqfhzoajsqi3aa' WHERE id LIKE '%nova%sky%' OR id LIKE '%nova%cheon%';
UPDATE shop_items SET image_url = 'ipfs://bafybeifo2iw4nyynamdohbl45vtb4pkc3puqyhwxdds63jt3s7hhbigpj4' WHERE id LIKE '%nova%ground%' OR id LIKE '%nova%ji%';
UPDATE shop_items SET image_url = 'ipfs://bafybeidx2vv3fiepz4z5m7nwabpcucq5hvhotshwrmgvfssln7dfllolfi' WHERE id LIKE '%nova%man%' OR id LIKE '%nova%in%';

-- Aetherion tier
UPDATE shop_items SET image_url = 'ipfs://bafybeidkisur3ziwdnicakyhcuaxejlbnyonb4t4xnhmobjl7inkny24ea' WHERE id LIKE '%aetherion%taegeuk%';
UPDATE shop_items SET image_url = 'ipfs://bafybeigyo56qmbtrzj4vprk4rh5x5ausiyemjgsxjvfvocbsfam6bwqv6u' WHERE id LIKE '%aetherion%mugeuk%';

-- Singularity tier
UPDATE shop_items SET image_url = 'ipfs://bafybeih6qzbs2dfazjxvh35ndc6aoatbpb2ilxryhpm2gl27lslx6uypry' WHERE id LIKE '%singularity%';
