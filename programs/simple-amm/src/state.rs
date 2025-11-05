use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,
    
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = payer,
        token::mint = token_a_mint,
        token::authority = pool,
    )]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        token::mint = token_b_mint,
        token::authority = pool,
    )]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = pool,
    )]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut, address = pool.token_a_mint)]
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = pool.token_b_mint)]
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = pool.token_a_vault)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = pool.token_b_vault)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = pool.lp_mint)]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub user_token_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_token_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_lp_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut, address = pool.token_a_mint)]
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = pool.token_b_mint)]
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = pool.token_a_vault)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = pool.token_b_vault)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = pool.lp_mint)]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut)]
    pub user_token_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_token_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_lp_token: Box<InterfaceAccount<'info, TokenAccount>>,

    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut, address = pool.token_a_mint)]
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = pool.token_b_mint)]
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = pool.token_a_vault)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = pool.token_b_vault)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_token_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub user_token_b: Box<InterfaceAccount<'info, TokenAccount>>,

    pub user: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub fee_numerator: u64,
    pub fee_denominator: u64,
    pub bump: u8,
}

