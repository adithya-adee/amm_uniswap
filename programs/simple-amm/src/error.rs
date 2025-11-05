
use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Invalid amount provided")]
    InvalidAmount,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Invalid fee configuration")]
    InvalidFee,
}