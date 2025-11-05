import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleAmm } from "../target/types/simple_amm";
import {
  createAccount,
  createMint,
  getAccount,
  mintTo,
  createAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("simple-amm", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.simpleAmm as Program<SimpleAmm>;
  const connection = provider.connection;
  const payer = provider.wallet as anchor.Wallet;

  let tokenAMint: anchor.web3.PublicKey;
  let tokenBMint: anchor.web3.PublicKey;
  let userTokenA: anchor.web3.PublicKey;
  let userTokenB: anchor.web3.PublicKey;
  let poolPda: anchor.web3.PublicKey;
  let tokenAVault: anchor.web3.PublicKey;
  let tokenBVault: anchor.web3.PublicKey;
  let lpMint: anchor.web3.PublicKey;
  let userLpToken: anchor.web3.PublicKey;

  const DECIMALS = 9;
  const INITIAL_SUPPLY = 1_000_000_000_000_000; // 1M tokens with 9 decimals

  before(async () => {
    // Create Token A
    tokenAMint = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      DECIMALS
    );

    // Create Token B
    tokenBMint = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      null,
      DECIMALS
    );

    // Create User Token Account
    userTokenA = await createAccount(
      connection,
      payer.payer,
      tokenAMint,
      payer.publicKey
    );

    userTokenB = await createAccount(
      connection,
      payer.payer,
      tokenBMint,
      payer.publicKey
    );

    // Mint initial supply to user
    await mintTo(
      connection,
      payer.payer,
      tokenAMint,
      userTokenA,
      payer.publicKey,
      INITIAL_SUPPLY
    );

    await mintTo(
      connection,
      payer.payer,
      tokenBMint,
      userTokenB,
      payer.publicKey,
      INITIAL_SUPPLY
    );

    console.log("Token A Mint:", tokenAMint.toBase58());
    console.log("Token B Mint:", tokenBMint.toBase58());
    console.log("User Token A Account:", userTokenA.toBase58());
    console.log("User Token B Account:", userTokenB.toBase58());
  });

  describe("Initialize Pool", () => {
    it("Initializes a new liquidity pool", async () => {
      [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenAMint.toBuffer(), tokenBMint.toBuffer()],
        program.programId
      );

      // Generate keypairs for vaults and LP mint
      const tokenAVaultKeypair = anchor.web3.Keypair.generate();
      const tokenBVaultKeypair = anchor.web3.Keypair.generate();
      const lpMintKeypair = anchor.web3.Keypair.generate();

      tokenAVault = tokenAVaultKeypair.publicKey;
      tokenBVault = tokenBVaultKeypair.publicKey;
      lpMint = lpMintKeypair.publicKey;

      const feeNumerator = new anchor.BN(3);
      const feeDenominator = new anchor.BN(1000); // 0.3% fee

      await program.methods
        .initializePool(feeNumerator, feeDenominator)
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          lpMint: lpMint,
          payer: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([tokenAVaultKeypair, tokenBVaultKeypair, lpMintKeypair])
        .rpc();

      // Verify pool account
      const poolAccount = await program.account.pool.fetch(poolPda);
      assert.equal(poolAccount.tokenAMint.toBase58(), tokenAMint.toBase58());
      assert.equal(poolAccount.tokenBMint.toBase58(), tokenBMint.toBase58());
      assert.equal(poolAccount.feeNumerator.toNumber(), 3);
      assert.equal(poolAccount.feeDenominator.toNumber(), 1000);

      console.log("Pool initialized successfully!");
      console.log("Pool PDA:", poolPda.toBase58());
    });

    it("Fails to initialize pool with invalid fee", async () => {
      const [invalidPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenBMint.toBuffer(), tokenAMint.toBuffer()],
        program.programId
      );

      const tokenAVaultKeypair = anchor.web3.Keypair.generate();
      const tokenBVaultKeypair = anchor.web3.Keypair.generate();
      const lpMintKeypair = anchor.web3.Keypair.generate();

      try {
        await program.methods
          .initializePool(new anchor.BN(1000), new anchor.BN(100)) // Invalid: numerator >= denominator
          .accounts({
            pool: invalidPoolPda,
            tokenAMint: tokenBMint,
            tokenBMint: tokenAMint,
            tokenAVault: tokenAVaultKeypair.publicKey,
            tokenBVault: tokenBVaultKeypair.publicKey,
            lpMint: lpMintKeypair.publicKey,
            payer: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([tokenAVaultKeypair, tokenBVaultKeypair, lpMintKeypair])
          .rpc();

        assert.fail("Should have failed with invalid fee");
      } catch (error) {
        assert.include(error.message, "InvalidFee");
      }
    });
  });

  describe("Add Liquidity", () => {
    before(async () => {
      // Use associated token account for LP tokens 
      userLpToken = await createAssociatedTokenAccount(
        connection,
        payer.payer,
        lpMint,
        payer.publicKey
      );
    });

    it("adds initial liquidity to the pool", async () => {
      // 100 tokens
      const amountA = new anchor.BN(100_000_000_000);
      const amountB = new anchor.BN(100_000_000_000);
      const minLpToken = new anchor.BN(0);

      await program.methods
        .addLiquidity(amountA, amountB, minLpToken)
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          lpMint: lpMint,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          userLpToken: userLpToken,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      // Verify balances
      const vaultAAccount = await getAccount(connection, tokenAVault);
      const vaultBAccount = await getAccount(connection, tokenBVault);
      const userLpAccount = await getAccount(connection, userLpToken);

      assert.equal(vaultAAccount.amount.toString(), amountA.toString());
      assert.equal(vaultBAccount.amount.toString(), amountB.toString());
      assert.isTrue(userLpAccount.amount > BigInt(0));

      console.log("Initial liquidity added!");
      console.log("Vault A Balance:", vaultAAccount.amount.toString());
      console.log("Vault B Balance:", vaultBAccount.amount.toString());
      console.log("LP Tokens Received:", userLpAccount.amount.toString());
    });

    it("Adds more liquidity proportionally", async () => {
      const amountA = new anchor.BN(50_000_000_000); // 50 tokens
      const amountB = new anchor.BN(50_000_000_000); // 50 tokens
      const minLpTokens = new anchor.BN(0);

      const lpBalanceBefore = await getAccount(connection, userLpToken);

      await program.methods
        .addLiquidity(amountA, amountB, minLpTokens)
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          lpMint: lpMint,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          userLpToken: userLpToken,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const lpBalanceAfter = await getAccount(connection, userLpToken);
      const lpTokensReceived = lpBalanceAfter.amount - lpBalanceBefore.amount;

      assert.isTrue(lpTokensReceived > BigInt(0));
      console.log(
        "Additional LP Tokens Received:",
        lpTokensReceived.toString()
      );
    });

    it("Fails when slippage tolerance is exceeded", async () => {
      const amountA = new anchor.BN(10_000_000_000);
      const amountB = new anchor.BN(10_000_000_000);
      const minLpTokens = new anchor.BN(1_000_000_000_000); // Unrealistically high

      try {
        await program.methods
          .addLiquidity(amountA, amountB, minLpTokens)
          .accounts({
            pool: poolPda,
            tokenAMint: tokenAMint,
            tokenBMint: tokenBMint,
            tokenAVault: tokenAVault,
            tokenBVault: tokenBVault,
            lpMint: lpMint,
            userTokenA: userTokenA,
            userTokenB: userTokenB,
            userLpToken: userLpToken,
            user: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();

        assert.fail("Should have failed with slippage exceeded");
      } catch (error) {
        assert.include(error.message, "SlippageExceeded");
      }
    });
  });

  describe("Swap", () => {
    it("Swap tokan A for token B", async () => {
      const amountIn = new anchor.BN(1_000_000_000);
      const minimumAmountOut = new anchor.BN(0);
      const aToB = true;

      const userABalanceBefore = await getAccount(connection, userTokenA);
      const userBBalanceBefore = await getAccount(connection, userTokenB);

      await program.methods
        .swap(amountIn, minimumAmountOut, aToB)
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const userABalanceAfter = await getAccount(connection, userTokenA);
      const userBBalanceAfter = await getAccount(connection, userTokenB);

      const tokenASpent = userABalanceBefore.amount - userABalanceAfter.amount;
      const tokenBReceived =
        userBBalanceAfter.amount - userBBalanceBefore.amount;

      assert.equal(tokenASpent.toString(), amountIn.toString());
      assert.isTrue(tokenBReceived > BigInt(0));

      console.log("Swap A->B successful!");
      console.log("Token A Spent:", tokenASpent.toString());
      console.log("Token B Received:", tokenBReceived.toString());
    });

    it("Swaps token B for token A", async () => {
      const amountIn = new anchor.BN(1_000_000_000); // 1 token
      const minimumAmountOut = new anchor.BN(0);
      const aToB = false;

      const userABalanceBefore = await getAccount(connection, userTokenA);
      const userBBalanceBefore = await getAccount(connection, userTokenB);

      await program.methods
        .swap(amountIn, minimumAmountOut, aToB)
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const userABalanceAfter = await getAccount(connection, userTokenA);
      const userBBalanceAfter = await getAccount(connection, userTokenB);

      const tokenBSpent = userBBalanceBefore.amount - userBBalanceAfter.amount;
      const tokenAReceived =
        userABalanceAfter.amount - userABalanceBefore.amount;

      assert.equal(tokenBSpent.toString(), amountIn.toString());
      assert.isTrue(tokenAReceived > BigInt(0));

      console.log("Swap B->A successful!");
      console.log("Token B Spent:", tokenBSpent.toString());
      console.log("Token A Received:", tokenAReceived.toString());
    });

    it("Fails when slippage tolerance is exceeded", async () => {
      const amountIn = new anchor.BN(1_000_000_000);
      const minimumAmountOut = new anchor.BN(10_000_000_000); // Unrealistically high
      const aToB = true;

      try {
        await program.methods
          .swap(amountIn, minimumAmountOut, aToB)
          .accounts({
            pool: poolPda,
            tokenAMint: tokenAMint,
            tokenBMint: tokenBMint,
            tokenAVault: tokenAVault,
            tokenBVault: tokenBVault,
            userTokenA: userTokenA,
            userTokenB: userTokenB,
            user: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();

        assert.fail("Should have failed with slippage exceeded");
      } catch (error) {
        assert.include(error.message, "SlippageExceeded");
      }
    });
  });

  describe("Remove Liquidity", () => {
    it("Removes partial liquidity", async () => {
      const userLpBalance = await getAccount(connection, userLpToken);
      const lpAmountToRemove = new anchor.BN(
        (userLpBalance.amount / BigInt(4)).toString()
      ); // Remove 25%

      const userABalanceBefore = await getAccount(connection, userTokenA);
      const userBBalanceBefore = await getAccount(connection, userTokenB);

      await program.methods
        .removeLiquidity(lpAmountToRemove, new anchor.BN(0), new anchor.BN(0))
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          lpMint: lpMint,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          userLpToken: userLpToken,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const userABalanceAfter = await getAccount(connection, userTokenA);
      const userBBalanceAfter = await getAccount(connection, userTokenB);
      const userLpBalanceAfter = await getAccount(connection, userLpToken);

      const tokenAReceived =
        userABalanceAfter.amount - userABalanceBefore.amount;
      const tokenBReceived =
        userBBalanceAfter.amount - userBBalanceBefore.amount;
      const lpTokensBurned = userLpBalance.amount - userLpBalanceAfter.amount;

      assert.equal(lpTokensBurned.toString(), lpAmountToRemove.toString());
      assert.isTrue(tokenAReceived > BigInt(0));
      assert.isTrue(tokenBReceived > BigInt(0));

      console.log("Liquidity removed!");
      console.log("LP Tokens Burned:", lpTokensBurned.toString());
      console.log("Token A Received:", tokenAReceived.toString());
      console.log("Token B Received:", tokenBReceived.toString());
    });

    it("Removes all remaining liquidity", async () => {
      const userLpBalance = await getAccount(connection, userLpToken);
      const lpAmountToRemove = new anchor.BN(userLpBalance.amount.toString());

      await program.methods
        .removeLiquidity(lpAmountToRemove, new anchor.BN(0), new anchor.BN(0))
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          lpMint: lpMint,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          userLpToken: userLpToken,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const userLpBalanceAfter = await getAccount(connection, userLpToken);
      assert.equal(userLpBalanceAfter.amount.toString(), "0");

      console.log("All liquidity removed!");
    });

    it("Fails when slippage tolerance is exceeded", async () => {
      // First add some liquidity back
      await program.methods
        .addLiquidity(
          new anchor.BN(10_000_000_000),
          new anchor.BN(10_000_000_000),
          new anchor.BN(0)
        )
        .accounts({
          pool: poolPda,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAVault: tokenAVault,
          tokenBVault: tokenBVault,
          lpMint: lpMint,
          userTokenA: userTokenA,
          userTokenB: userTokenB,
          userLpToken: userLpToken,
          user: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      const userLpBalance = await getAccount(connection, userLpToken);

      try {
        await program.methods
          .removeLiquidity(
            new anchor.BN(userLpBalance.amount.toString()),
            new anchor.BN(1_000_000_000_000), // Unrealistically high
            new anchor.BN(1_000_000_000_000) // Unrealistically high
          )
          .accounts({
            pool: poolPda,
            tokenAMint: tokenAMint,
            tokenBMint: tokenBMint,
            tokenAVault: tokenAVault,
            tokenBVault: tokenBVault,
            lpMint: lpMint,
            userTokenA: userTokenA,
            userTokenB: userTokenB,
            userLpToken: userLpToken,
            user: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();

        assert.fail("Should have failed with slippage exceeded");
      } catch (error) {
        assert.include(error.message, "SlippageExceeded");
      }
    });
  });

  describe("Edge Cases", () => {
    it("Fails to swap with zero amount", async () => {
      try {
        await program.methods
          .swap(new anchor.BN(0), new anchor.BN(0), true)
          .accounts({
            pool: poolPda,
            tokenAMint: tokenAMint,
            tokenBMint: tokenBMint,
            tokenAVault: tokenAVault,
            tokenBVault: tokenBVault,
            userTokenA: userTokenA,
            userTokenB: userTokenB,
            user: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();

        assert.fail("Should have failed with invalid amount");
      } catch (error) {
        assert.include(error.message, "InvalidAmount");
      }
    });

    it("Fails to add liquidity with zero amounts", async () => {
      try {
        await program.methods
          .addLiquidity(new anchor.BN(0), new anchor.BN(0), new anchor.BN(0))
          .accounts({
            pool: poolPda,
            tokenAMint: tokenAMint,
            tokenBMint: tokenBMint,
            tokenAVault: tokenAVault,
            tokenBVault: tokenBVault,
            lpMint: lpMint,
            userTokenA: userTokenA,
            userTokenB: userTokenB,
            userLpToken: userLpToken,
            user: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();

        assert.fail("Should have failed with invalid amount");
      } catch (error) {
        assert.include(error.message, "InvalidAmount");
      }
    });

    it("Fails to initialize Pool with same mint", async () => {
      const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenAMint.toBuffer(), tokenAMint.toBuffer()],
        program.programId
      );

      // Generate keypairs for vaults and LP mint
      const tokenAVaultKeypair = anchor.web3.Keypair.generate();
      const tokenBVaultKeypair = anchor.web3.Keypair.generate();
      const lpMintKeypair = anchor.web3.Keypair.generate();

      tokenAVault = tokenAVaultKeypair.publicKey;
      tokenBVault = tokenBVaultKeypair.publicKey;
      lpMint = lpMintKeypair.publicKey;

      const feeNumerator = new anchor.BN(3);
      const feeDenominator = new anchor.BN(1000); // 0.3% fee

      try {
        await program.methods
          .initializePool(feeNumerator, feeDenominator)
          .accounts({
            pool: poolPda,
            tokenAMint: tokenAMint,
            tokenBMint: tokenAMint,
            tokenAVault: tokenAVault,
            tokenBVault: tokenBVault,
            lpMint: lpMint,
            payer: payer.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          } as any)
          .signers([tokenAVaultKeypair, tokenBVaultKeypair, lpMintKeypair])
          .rpc();

        assert.fail("Failed to check identical mints");
      } catch (error) {
        assert.include(error.message, "IdenticalMints");
      }
    });
  });
});
