# amm-uniswap

Core logic as Uniswap V2's constant product formula (x \* y = k), including the fee calculation.

## Key Concepts

1. **Initialize Pool**: Creates the infrastructure (vaults, LP mint) and sets fee parameters

2. **Add Liquidity**:

   - First provider gets `sqrt(amount_a × amount_b)` LP tokens
   - Subsequent providers get proportional LP tokens based on existing reserves
     `min((amount_a * lp_suppy) / amount_in_a , (amount_b * lp_suppy) / amount_in_b)`

3. **Swap**:

   - Uses constant product formula:
     `amount_out = (amount_in_with_fee * reserve_out) / (reserve_in_with_fee + 
   amount_in_with_fee)`
   - Fee is deducted from input amount
   - Slippage protection via `minimum_amount_out`

4. **Remove Liquidity**:

   - Burns LP tokens
   - Returns proportional amounts: `(lp_amount / lp_supply) × vault_balance`
   - Slippage protection via minimum amounts
