use anchor_lang::prelude::*;
use anchor_spl::token_interface;
use crate::error::AmmError;
use crate::state::*;

// Initialize a new liquidity pool
pub fn initialize_pool(
    ctx: Context<InitializePool>,
    fee_numerator: u64,
    fee_denominator: u64,
) -> Result<()> {
    require!(fee_denominator > 0, AmmError::InvalidFee);
    require!(fee_numerator < fee_denominator, AmmError::InvalidFee);

    let pool = &mut ctx.accounts.pool;
    pool.token_a_mint = ctx.accounts.token_a_mint.key();
    pool.token_b_mint = ctx.accounts.token_b_mint.key();
    pool.token_a_vault = ctx.accounts.token_a_vault.key();
    pool.token_b_vault = ctx.accounts.token_b_vault.key();
    pool.lp_mint = ctx.accounts.lp_mint.key();
    pool.fee_numerator = fee_numerator;
    pool.fee_denominator = fee_denominator;
    pool.bump = ctx.bumps.pool;

    Ok(())
}

// Add liquidity to the pool
pub fn add_liquidity(
    ctx: Context<AddLiquidity>,
    amount_a: u64,
    amount_b: u64,
    min_lp_tokens: u64,
) -> Result<()> {
    require!(amount_a > 0 && amount_b > 0, AmmError::InvalidAmount);

    let pool = &ctx.accounts.pool;
    let vault_a_amount = ctx.accounts.token_a_vault.amount;
    let vault_b_amount = ctx.accounts.token_b_vault.amount;
    let lp_supply = ctx.accounts.lp_mint.supply;

    // Calculate LP tokens to mint
    let lp_tokens = if lp_supply == 0 {
        // First liquidity provider gets sqrt(a * b) LP tokens
        (amount_a as u128)
            .checked_mul(amount_b as u128)
            .unwrap()
            .integer_sqrt() as u64
    } else {
        // Subsequent providers get proportional LP tokens
        let lp_from_a = (amount_a as u128)
            .checked_mul(lp_supply as u128)
            .unwrap()
            .checked_div(vault_a_amount as u128)
            .unwrap() as u64;

        let lp_from_b = (amount_b as u128)
            .checked_mul(lp_supply as u128)
            .unwrap()
            .checked_div(vault_b_amount as u128)
            .unwrap() as u64;

        std::cmp::min(lp_from_a, lp_from_b)
    };

    require!(lp_tokens >= min_lp_tokens, AmmError::SlippageExceeded);

    // Transfer token A from user to vault
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.user_token_a.to_account_info(),
                to: ctx.accounts.token_a_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
                mint: ctx.accounts.token_a_mint.to_account_info(),
            },
        ),
        amount_a,
        ctx.accounts.token_a_mint.decimals,
    )?;

    // Transfer token B from user to vault
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.user_token_b.to_account_info(),
                to: ctx.accounts.token_b_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
                mint: ctx.accounts.token_b_mint.to_account_info(),
            },
        ),
        amount_b,
        ctx.accounts.token_b_mint.decimals,
    )?;

    // Mint LP tokens to user
    let seeds = &[
        b"pool",
        pool.token_a_mint.as_ref(),
        pool.token_b_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&seeds[..]];

    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_interface::MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.user_lp_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer,
        ),
        lp_tokens,
    )?;

    Ok(())
}

// Remove liquidity from the pool
pub fn remove_liquidity(
    ctx: Context<RemoveLiquidity>,
    lp_amount: u64,
    min_amount_a: u64,
    min_amount_b: u64,
) -> Result<()> {
    require!(lp_amount > 0, AmmError::InvalidAmount);

    let pool = &ctx.accounts.pool;
    let lp_supply = ctx.accounts.lp_mint.supply;
    let vault_a_amount = ctx.accounts.token_a_vault.amount;
    let vault_b_amount = ctx.accounts.token_b_vault.amount;

    // Calculate amounts to return
    let amount_a = (lp_amount as u128)
        .checked_mul(vault_a_amount as u128)
        .unwrap()
        .checked_div(lp_supply as u128)
        .unwrap() as u64;

    let amount_b = (lp_amount as u128)
        .checked_mul(vault_b_amount as u128)
        .unwrap()
        .checked_div(lp_supply as u128)
        .unwrap() as u64;

    require!(
        amount_a >= min_amount_a && amount_b >= min_amount_b,
        AmmError::SlippageExceeded
    );

    // Burn LP tokens
    token_interface::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_interface::Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.user_lp_token.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        lp_amount,
    )?;

    let seeds = &[
        b"pool",
        pool.token_a_mint.as_ref(),
        pool.token_b_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&seeds[..]];

    // Transfer token A back to user
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.token_a_vault.to_account_info(),
                to: ctx.accounts.user_token_a.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
                mint: ctx.accounts.token_a_mint.to_account_info(),
            },
            signer,
        ),
        amount_a,
        ctx.accounts.token_a_mint.decimals,
    )?;

    // Transfer token B back to user
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_interface::TransferChecked {
                from: ctx.accounts.token_b_vault.to_account_info(),
                to: ctx.accounts.user_token_b.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
                mint: ctx.accounts.token_b_mint.to_account_info(),
            },
            signer,
        ),
        amount_b,
        ctx.accounts.token_b_mint.decimals,
    )?;

    Ok(())
}

// Swap tokens
pub fn swap(
    ctx: Context<Swap>,
    amount_in: u64,
    minimum_amount_out: u64,
    a_to_b: bool,
) -> Result<()> {
    require!(amount_in > 0, AmmError::InvalidAmount);

    let pool = &ctx.accounts.pool;
    let vault_a_amount = ctx.accounts.token_a_vault.amount;
    let vault_b_amount = ctx.accounts.token_b_vault.amount;

    // Calculate amount out using constant product formula
    let (reserve_in, reserve_out) = if a_to_b {
        (vault_a_amount, vault_b_amount)
    } else {
        (vault_b_amount, vault_a_amount)
    };

    // Apply fee
    let amount_in_with_fee = (amount_in as u128)
        .checked_mul((pool.fee_denominator - pool.fee_numerator) as u128)
        .unwrap();

    let numerator = amount_in_with_fee.checked_mul(reserve_out as u128).unwrap();

    let denominator = (reserve_in as u128)
        .checked_mul(pool.fee_denominator as u128)
        .unwrap()
        .checked_add(amount_in_with_fee)
        .unwrap();

    let amount_out = numerator.checked_div(denominator).unwrap() as u64;

    require!(amount_out >= minimum_amount_out, AmmError::SlippageExceeded);
    require!(amount_out > 0, AmmError::InvalidAmount);

    let seeds = &[
        b"pool",
        pool.token_a_mint.as_ref(),
        pool.token_b_mint.as_ref(),
        &[pool.bump],
    ];
    let signer = &[&seeds[..]];

    if a_to_b {
        // Transfer token A from user to vault
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.user_token_a.to_account_info(),
                    to: ctx.accounts.token_a_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.token_a_mint.to_account_info(),
                },
            ),
            amount_in,
            ctx.accounts.token_a_mint.decimals,
        )?;

        // Transfer token B from vault to user
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.token_b_vault.to_account_info(),
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                    mint: ctx.accounts.token_b_mint.to_account_info(),
                },
                signer,
            ),
            amount_out,
            ctx.accounts.token_b_mint.decimals,
        )?;
    } else {
        // Transfer token B from user to vault
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.user_token_b.to_account_info(),
                    to: ctx.accounts.token_b_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.token_b_mint.to_account_info(),
                },
            ),
            amount_in,
            ctx.accounts.token_b_mint.decimals,
        )?;

        // Transfer token A from vault to user
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.token_a_vault.to_account_info(),
                    to: ctx.accounts.user_token_a.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                    mint: ctx.accounts.token_a_mint.to_account_info(),
                },
                signer,
            ),
            amount_out,
            ctx.accounts.token_a_mint.decimals,
        )?;
    }

    Ok(())
}

// Helper trait for integer square root
trait IntegerSquareRoot {
    fn integer_sqrt(&self) -> Self;
}

impl IntegerSquareRoot for u128 {
    fn integer_sqrt(&self) -> Self {
        let mut x = *self;
        let mut y = (x + 1) / 2;
        while y < x {
            x = y;
            y = (x + self / x) / 2;
        }
        x
    }
}