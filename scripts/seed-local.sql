-- Seed shop_items with IPFS URLs
INSERT OR REPLACE INTO shop_items (id, category, name, description, price, currency, tier, metadata, image_url, available, requires_nickname, created_at) VALUES
-- OBSIDIAN Tier
('nft_obsidian', 'NFT', '호랑이', '호랑이', 300000, 'DEL', 'Obsidian', NULL, 'ipfs://bafybeihhwd3ivt5k6s6qnj3yscm3wtretf2bzdmostflwicfar4t6vmcjy', 1, 0, 1733750400000),
('nft_obsidian_crane', 'NFT', '두루미', '두루미', 300000, 'DEL', 'Obsidian', NULL, 'ipfs://bafybeihowygs5i6n7tdazn2wrhhwz2nrwobgtjsn57y6gkj7ypezjguh7i', 1, 0, 1733750400000),
('nft_obsidian_otter', 'NFT', '수달', '수달', 300000, 'DEL', 'Obsidian', NULL, 'ipfs://bafybeigijtniqm2azxpdhs2pywytnw6tlvjcqz6xyqtz74tputmxnz2qoa', 1, 0, 1733750400000),
('nft_obsidian_ssang', 'NFT', '삵', '삵', 300000, 'DEL', 'Obsidian', NULL, 'ipfs://bafybeifxzkgrd2klnv5y65qza6gswcejzrg24kued3k6is2sgofbtligxy', 1, 0, 1733750400000),
('nft_obsidian_bear', 'NFT', '반달가슴곰', '반달가슴곰', 300000, 'DEL', 'Obsidian', NULL, 'ipfs://bafybeiglrknmrxo3jm4g3nveqvxv6n4sozp3y32ib7cxik3ammjsmpryf4', 1, 0, 1733750400000),
-- AURUM Tier
('nft_aurum', 'NFT', '청룡', '청룡', 500000, 'DEL', 'Aurum', NULL, 'ipfs://bafybeihfdmhzmkqzomzq3s2jvy2o7pjtshnhx63wwd5y66j7hrh2ftsysi', 1, 0, 1733750400000),
('nft_aurum_white_tiger', 'NFT', '백호', '백호', 500000, 'DEL', 'Aurum', NULL, 'ipfs://bafybeic7y5qkv34fclloygbntzf63tbdzvhlarrdnt7sn6opvucmlc3pze', 1, 0, 1733750400000),
('nft_aurum_black_turtle', 'NFT', '현무', '현무', 500000, 'DEL', 'Aurum', NULL, 'ipfs://bafybeicddiccbudqjtblgkfs4fgm7so3vciljx26rmaioc3nr5dlvwwkwu', 1, 0, 1733750400000),
('nft_aurum_fire_bird', 'NFT', '주작', '주작', 500000, 'DEL', 'Aurum', NULL, 'ipfs://bafybeieruflmccrv44haggwfjpryfytcupcspmxzogwc2vlod3daun6zou', 1, 0, 1733750400000),
-- NOVA Tier
('nft_nova', 'NFT', '천', '천', 750000, 'DEL', 'Nova', NULL, 'ipfs://bafybeibsxr6ztbo6fushzmmqpwptddxtam5oimvnamuntqfhzoajsqi3aa', 1, 0, 1733750400000),
('nft_nova_ground', 'NFT', '지', '지', 750000, 'DEL', 'Nova', NULL, 'ipfs://bafybeifo2iw4nyynamdohbl45vtb4pkc3puqyhwxdds63jt3s7hhbigpj4', 1, 0, 1733750400000),
('nft_nova_man', 'NFT', '인', '인', 750000, 'DEL', 'Nova', NULL, 'ipfs://bafybeidx2vv3fiepz4z5m7nwabpcucq5hvhotshwrmgvfssln7dfllolfi', 1, 0, 1733750400000),
-- AETHERION Tier
('nft_aetherion', 'NFT', '태극', '태극', 1000000, 'DEL', 'Aetherion', NULL, 'ipfs://bafybeidkisur3ziwdnicakyhcuaxejlbnyonb4t4xnhmobjl7inkny24ea', 1, 0, 1733750400000),
('nft_aetherion_mugeuk', 'NFT', '무극', '무극', 1000000, 'DEL', 'Aetherion', NULL, 'ipfs://bafybeigyo56qmbtrzj4vprk4rh5x5ausiyemjgsxjvfvocbsfam6bwqv6u', 1, 0, 1733750400000),
-- SINGULARITY Tier
('nft_singularity', 'NFT', 'Singularity', 'Singularity', 2000000, 'DEL', 'Singularity', NULL, 'ipfs://bafybeih6qzbs2dfazjxvh35ndc6aoatbpb2ilxryhpm2gl27lslx6uypry', 1, 0, 1733750400000),
-- Non-NFT Items
('item_nickname', 'NICKNAME', '닉네임 변경권', '닉네임을 변경할 수 있습니다', 100000, 'DEL', NULL, NULL, NULL, 1, 0, 1733750400000),
('item_boost_24h', 'BOOST', '24시간 부스트', '24시간 동안 보상 2배', 200000, 'DEL', NULL, '{"duration": 86400000}', NULL, 1, 0, 1733750400000),
('item_mushroom', 'ITEM', '초록버섯', '특별한 아이템', 50000, 'DEL', NULL, NULL, NULL, 1, 0, 1733750400000),
('item_crystal', 'CRYSTAL', '크리스탈', '프리미엄 재화', 10000, 'DEL', NULL, NULL, NULL, 1, 0, 1733750400000),
('color_gold', 'COLOR', '황금색', '닉네임 색상', 150000, 'DEL', NULL, '{"color": "#FFD700"}', NULL, 1, 1, 1733750400000);
