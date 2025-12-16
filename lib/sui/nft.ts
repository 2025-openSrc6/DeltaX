import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { suiClient, PACKAGE_ID } from './client';

/**
 * NFT 민팅 함수
 * @param userAddress - NFT를 받을 사용자 주소
 * @param metadataUrl - IPFS 메타데이터 URL (ipfs://...)
 * @param tier - NFT 등급 (A~E)
 * @param adminKeypair - Admin keypair (가스비 대납용)
 */
export async function mintNFT({
<<<<<<< HEAD
  userAddress,
  metadataUrl,
  tier,
  name,
  description,
  adminKeypair,
}: {
  userAddress: string;
  metadataUrl: string;
  tier: string;
  name: string;
  description: string;
  adminKeypair: Ed25519Keypair;
}) {
  const tx = new Transaction();

  // nft.move의 mint_nft 함수 호출
  // Move 컨트랙트: mint_nft(name, description, url, tier, recipient, ctx)
  tx.moveCall({
    target: `${PACKAGE_ID}::nft::mint_nft`,
    arguments: [
      tx.pure.string(name),
      tx.pure.string(description),
      tx.pure.string(metadataUrl),
      tx.pure.string(tier),
      tx.pure.address(userAddress),
    ],
  });

  // Admin이 가스비 대납
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: adminKeypair,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error('NFT 민팅 실패');
  }

  // NFT Object ID 추출
  const nftObjectChange = result.objectChanges?.find(
    (change: { type?: string; objectType?: string }) =>
      change.type === 'created' && change.objectType?.includes('DeltaxNFT'),
  );

  if (!nftObjectChange || nftObjectChange.type !== 'created') {
    console.log('🔍 Object Changes:', JSON.stringify(result.objectChanges, null, 2));
    throw new Error('NFT Object를 찾을 수 없습니다');
  }

  return {
    nftObjectId: nftObjectChange.objectId,
    txHash: result.digest,
  };
=======
    userAddress,
    metadataUrl,
    tier,
    name,
    description,
    adminKeypair,
}: {
    userAddress: string;
    metadataUrl: string;
    tier: string;
    name: string;
    description: string;
    adminKeypair: Ed25519Keypair;
}) {
    const tx = new Transaction();

    // nft.move의 mint_nft 함수 호출
    // Move 컨트랙트: mint_nft(name, description, url, tier, recipient, ctx)
    tx.moveCall({
        target: `${PACKAGE_ID}::nft::mint_nft`,
        arguments: [
            tx.pure.string(name),
            tx.pure.string(description),
            tx.pure.string(metadataUrl),
            tx.pure.string(tier),
            tx.pure.address(userAddress),
        ],
    });

    // Admin이 가스비 대납
    const result = await suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: adminKeypair,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });

    if (result.effects?.status?.status !== 'success') {
        throw new Error('NFT 민팅 실패');
    }

    // NFT Object ID 추출
    const nftObjectChange = result.objectChanges?.find(
        (change: any) =>
            change.type === 'created' && change.objectType.includes('DeltaxNFT')
    );

    if (!nftObjectChange || nftObjectChange.type !== 'created') {
        console.log('🔍 Object Changes:', JSON.stringify(result.objectChanges, null, 2));
        throw new Error('NFT Object를 찾을 수 없습니다');
    }

    return {
        nftObjectId: nftObjectChange.objectId,
        txHash: result.digest,
    };
>>>>>>> 7e955ef (feat: Implement NFT Shop with UI, API, and Sui integration)
}
