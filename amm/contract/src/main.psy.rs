// PSY/pUSDT AMM contract for a single software-defined-key pool account.
// Transaction-shape authorization is REQUIRED before funding or operation.
// The token-compatible prefix lets this contract read the two genesis token
// Outbox layouts through Self::ABI at contract IDs 0 and 4.

#[derive(FeltSized)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

#[contract]
pub struct PsyUsdtAmm {
    // Read-only token view. These slots are unused in this contract's state.
    pub token_balance_view: Felt,
    pub token_reserved_1_view: Felt,
    pub token_reserved_2_view: Felt,
    pub other_user_info: ContractStateArray<1073741824, OtherUserInfo>,

    // Pool partition accounting. All amounts are base units.
    pub reserve_psy: Felt,
    pub reserve_usdt: Felt,
    pub total_shares: Felt,
    pub shares: ContractStateArray<16777216, Felt>,
    pub consumed_nonce: ContractStateArray<16777216, Felt>,

    // One payer-signed order lives in each payer's partition.
    pub order_kind: Felt,       // 1 swap, 2 add liquidity, 3 remove liquidity
    pub order_pool_user: Felt,
    pub order_asset: Felt,      // input token for swap: 0 PSY, 4 pUSDT
    pub order_amount_psy: Felt,
    pub order_amount_usdt: Felt,
    pub order_min_out: Felt,
    pub order_deadline: Felt,
    pub order_nonce: Felt,
    pub order_shares: Felt,
    pub order_min_psy: Felt,
    pub order_min_usdt: Felt,

    // Pool-side cursors for each payer's cumulative token Outbox. Every
    // authorized pool claim advances the matching cursor in the same stack.
    pub settled_psy_sent: ContractStateArray<16777216, Felt>,
    pub settled_usdt_sent: ContractStateArray<16777216, Felt>,
}

#[contract_implementation]
impl PsyUsdtAmm {
    // Fixed-length SD-key transaction stacks use this zero-input, read-only
    // call as padding. The fingerprint must bind its exact method and inputs.
    #[contract_method]
    pub fn noop(&mut self, ctx: &mut ChainContext) {
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
    }

    #[contract_method]
    pub fn open_swap(&mut self, ctx: &mut ChainContext, pool: Felt, asset: Felt, amount_in: Felt, min_out: Felt, deadline: Felt, nonce: Felt) {
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        require(asset == 0 || asset == 4, "invalid asset");
        require(self.order_kind == 0, "previous order still active");
        require(amount_in > 0 && amount_in <= 10000000, "input exceeds bounded pool limit");
        require(min_out > 0 && min_out <= 10000000, "invalid min out");
        require(deadline >= ctx.checkpoint_id, "expired order");
        require(nonce > self.order_nonce, "order nonce must increase");
        self.order_kind = 1;
        self.order_pool_user = pool;
        self.order_asset = asset;
        if asset == 0 {
            self.order_amount_psy = amount_in;
            self.order_amount_usdt = 0;
        } else {
            self.order_amount_psy = 0;
            self.order_amount_usdt = amount_in;
        }
        self.order_min_out = min_out;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    #[contract_method]
    pub fn open_add(&mut self, ctx: &mut ChainContext, pool: Felt, amount_psy: Felt, amount_usdt: Felt, min_shares: Felt, deadline: Felt, nonce: Felt) {
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        require(self.order_kind == 0, "previous order still active");
        require(amount_psy > 0 && amount_psy <= 10000000, "invalid PSY amount");
        require(amount_usdt > 0 && amount_usdt <= 10000000, "invalid pUSDT amount");
        require(min_shares > 0 && min_shares <= 10000000, "invalid share limit");
        require(deadline >= ctx.checkpoint_id, "expired order");
        require(nonce > self.order_nonce, "order nonce must increase");
        self.order_kind = 2;
        self.order_pool_user = pool;
        self.order_amount_psy = amount_psy;
        self.order_amount_usdt = amount_usdt;
        self.order_min_out = min_shares;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    #[contract_method]
    pub fn open_remove(&mut self, ctx: &mut ChainContext, pool: Felt, shares: Felt, min_psy: Felt, min_usdt: Felt, deadline: Felt, nonce: Felt) {
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        require(self.order_kind == 0, "previous order still active");
        require(shares > 0 && shares <= 10000000, "invalid shares");
        require(min_psy > 0 && min_usdt > 0, "invalid withdrawal limit");
        require(deadline >= ctx.checkpoint_id, "expired order");
        require(nonce > self.order_nonce, "order nonce must increase");
        self.order_kind = 3;
        self.order_pool_user = pool;
        self.order_shares = shares;
        self.order_min_psy = min_psy;
        self.order_min_usdt = min_usdt;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    // A payer releases their local order slot only after the pool's guarded
    // settlement cursors cover every payment sent. Split asset paths so a PSY-only proof
    // never reads an unused pUSDT state partition.
    #[contract_method]
    pub fn close_psy_swap(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 1 && self.order_asset == 0, "no PSY swap order");
        let pool = self.order_pool_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled PSY payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_usdt_swap(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 1 && self.order_asset == 4, "no pUSDT swap order");
        let pool = self.order_pool_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled fee payment keeps order open");
        let sent_usdt = ctx.users[ctx.user_id].contract_state::<Self::ABI>(4).other_user_info[pool].amount_sent;
        let settled_usdt = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_usdt_sent[ctx.user_id];
        require(sent_usdt == settled_usdt, "unsettled pUSDT payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_add(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 2, "no liquidity add order");
        let pool = self.order_pool_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled PSY payment keeps order open");
        let sent_usdt = ctx.users[ctx.user_id].contract_state::<Self::ABI>(4).other_user_info[pool].amount_sent;
        let settled_usdt = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_usdt_sent[ctx.user_id];
        require(sent_usdt == settled_usdt, "unsettled pUSDT payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_remove(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 3, "no liquidity remove order");
        let pool = self.order_pool_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled fee payment keeps order open");
        self.order_kind = 0;
    }

    // Consume a funded LP removal's fee without moving shares or reserves.
    // Its exact public stack claims only this payer's PSY and burns the fee.
    #[contract_method]
    pub fn cancel_remove(&mut self, ctx: &mut ChainContext, provider: Felt, nonce: Felt) {
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 3 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "no LP remove order");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[provider], "order already used");
        require(ctx.checkpoint_id > ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "LP remove order not expired");
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
        self.settled_psy_sent[provider] = sent_psy;
        self.consumed_nonce[provider] = nonce;
    }

    // Each operation requires a separate 1.0001 PSY fee escrow in the payer's
    // cumulative PSY Outbox. The pool refunds the full asset amount and keeps
    // only the fee escrow to cover the automatic network burn.
    #[contract_method]
    pub fn refund_unclaimed(&mut self, ctx: &mut ChainContext, sender: Felt, asset: Felt, amount: Felt) {
        require(asset == 0 || asset == 4, "invalid asset");
        require(sender > 0 && sender < 16777216 && sender != ctx.user_id, "invalid sender");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require(amount > 0 && amount <= 10000000, "invalid refund amount");
        let kind = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_kind;
        let pool = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user;
        require(kind == 1 && pool == ctx.user_id, "no swap order");
        require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_asset == asset, "wrong refund asset");
        if asset == 0 {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount, "PSY refund must match payer order");
        } else {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_usdt == amount, "pUSDT refund must match payer order");
        }
        let sent_psy = ctx.users[sender].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[sender];
        require(sent_psy > settled_psy, "no fee escrow");
        if asset == 0 {
            require(sent_psy - settled_psy == amount + 1000100000, "PSY refund or fee mismatch");
        } else {
            require(sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
            let sent_usdt = ctx.users[sender].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent;
            let settled_usdt = self.settled_usdt_sent[sender];
            require(sent_usdt > settled_usdt && sent_usdt - settled_usdt == amount, "pUSDT refund mismatch");
            self.settled_usdt_sent[sender] = sent_usdt;
        }
        self.settled_psy_sent[sender] = sent_psy;
    }

    // Refund exactly the assets already paid for an LP add. The caller uses
    // zero for a leg that was never paid. Both legs, when present, must be
    // claimed and returned in the same transaction, sharing one fee escrow.
    #[contract_method]
    pub fn refund_add_unclaimed(&mut self, ctx: &mut ChainContext, provider: Felt, amount_psy: Felt, amount_usdt: Felt) {
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require((amount_psy > 0 || amount_usdt > 0) && amount_psy <= 10000000 && amount_usdt <= 10000000, "invalid refund amounts");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 2 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "no LP add order");
        if amount_psy > 0 {
            require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount_psy, "wrong PSY refund amount");
        }
        if amount_usdt > 0 {
            require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_usdt == amount_usdt, "wrong pUSDT refund amount");
        }
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        let sent_usdt = ctx.users[provider].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent;
        let settled_usdt = self.settled_usdt_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == amount_psy + 1000100000, "PSY refund or fee mismatch");
        require(sent_usdt >= settled_usdt && sent_usdt - settled_usdt == amount_usdt, "pUSDT refund mismatch");
        self.settled_psy_sent[provider] = sent_psy;
        self.settled_usdt_sent[provider] = sent_usdt;
    }

    // The SD-key transaction must then claim the exact input token and
    // transfer amount_out of the opposite token to the same sender.
    #[contract_method]
    pub fn swap(&mut self, ctx: &mut ChainContext, sender: Felt, asset: Felt, amount_in: Felt, amount_out: Felt, nonce: Felt) {
        require(asset == 0 || asset == 4, "invalid asset");
        require(sender > 0 && sender < 16777216 && sender != ctx.user_id, "invalid sender");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require(amount_in > 0 && amount_in <= 10000000, "input exceeds bounded pool limit");
        require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 1 && ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "wrong order");
        require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_asset == asset && ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce, "wrong order input");
        require(nonce > self.consumed_nonce[sender], "order already used");
        require(ctx.checkpoint_id <= ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "order expired");
        if asset == 0 {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount_in, "wrong PSY input");
        } else {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_usdt == amount_in, "wrong pUSDT input");
        }
        let sent_psy = ctx.users[sender].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[sender];
        require(sent_psy > settled_psy, "missing PSY fee escrow");
        if asset == 0 {
            require(sent_psy - settled_psy == amount_in + 1000100000, "PSY swap or fee mismatch");
        } else {
            require(sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
            let sent_usdt = ctx.users[sender].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent;
            let settled_usdt = self.settled_usdt_sent[sender];
            require(sent_usdt > settled_usdt && sent_usdt - settled_usdt == amount_in, "pUSDT swap mismatch");
            self.settled_usdt_sent[sender] = sent_usdt;
        }
        if asset == 0 {
            let reserve_in = self.reserve_psy;
            let reserve_out = self.reserve_usdt;
            require(reserve_in > 0 && reserve_out > 0, "pool empty");
            require(reserve_in <= 10000000 - amount_in, "reserve cap exceeded");
            require(amount_out > 0 && amount_out < reserve_out && amount_out >= ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_min_out, "slippage or invalid output");
            // All quote products are below 2*10^18, below the field modulus.
            let numerator = amount_in * 9970 * reserve_out;
            let denominator = reserve_in * 10000 + amount_in * 9970;
            require(amount_out * denominator <= numerator, "output above exact quote");
            require(numerator < (amount_out + 1) * denominator, "output below exact quote");
            self.reserve_psy = reserve_in + amount_in;
            self.reserve_usdt = reserve_out - amount_out;
        } else {
            let reserve_in = self.reserve_usdt;
            let reserve_out = self.reserve_psy;
            require(reserve_in > 0 && reserve_out > 0, "pool empty");
            require(reserve_in <= 10000000 - amount_in, "reserve cap exceeded");
            require(amount_out > 0 && amount_out < reserve_out && amount_out >= ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_min_out, "slippage or invalid output");
            let numerator = amount_in * 9970 * reserve_out;
            let denominator = reserve_in * 10000 + amount_in * 9970;
            require(amount_out * denominator <= numerator, "output above exact quote");
            require(numerator < (amount_out + 1) * denominator, "output below exact quote");
            self.reserve_usdt = reserve_in + amount_in;
            self.reserve_psy = reserve_out - amount_out;
        }
        self.consumed_nonce[sender] = nonce;
        self.settled_psy_sent[sender] = sent_psy;
    }

    // The SD-key transaction must claim both deposits from provider.
    #[contract_method]
    pub fn add_liquidity(&mut self, ctx: &mut ChainContext, provider: Felt, amount_psy: Felt, amount_usdt: Felt, minted: Felt, nonce: Felt) {
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require(amount_psy > 0 && amount_usdt > 0, "zero liquidity");
        require(amount_psy <= 10000000 && amount_usdt <= 10000000, "deposit cap exceeded");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 2 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "wrong order");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount_psy && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_usdt == amount_usdt, "wrong deposit amounts");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[provider], "order already used");
        require(ctx.checkpoint_id <= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "order expired");
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        let sent_usdt = ctx.users[provider].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent;
        let settled_usdt = self.settled_usdt_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == amount_psy + 1000100000, "PSY deposit or fee mismatch");
        require(sent_usdt > settled_usdt && sent_usdt - settled_usdt == amount_usdt, "pUSDT deposit delta mismatch");
        let rp = self.reserve_psy;
        let ru = self.reserve_usdt;
        let total = self.total_shares;
        require(amount_psy <= 10000000 - rp && amount_usdt <= 10000000 - ru, "reserve cap exceeded");
        require(minted > 0 && minted >= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_min_out, "share limit");
        if total == 0 {
            require(rp == 0 && ru == 0, "invalid initial reserves");
            require(minted <= 10000000 - 1000, "initial share cap exceeded");
            let gross = minted + 1000;
            let product = amount_psy * amount_usdt;
            require(gross * gross <= product, "initial shares too high");
            require(product < (gross + 1) * (gross + 1), "initial shares too low");
            self.total_shares = gross;
        } else {
            require(rp > 0 && ru > 0 && total <= 10000000, "invalid reserves");
            require(amount_psy * ru == amount_usdt * rp, "deposit ratio mismatch");
            require(minted * rp <= amount_psy * total && amount_psy * total < (minted + 1) * rp, "wrong PSY shares");
            require(minted * ru <= amount_usdt * total && amount_usdt * total < (minted + 1) * ru, "wrong pUSDT shares");
            require(minted <= 10000000 - total, "share cap exceeded");
            self.total_shares = total + minted;
        }
        let owned = self.shares[provider];
        require(owned <= 10000000 - minted, "share balance overflow");
        self.shares[provider] = owned + minted;
        self.reserve_psy = rp + amount_psy;
        self.reserve_usdt = ru + amount_usdt;
        self.consumed_nonce[provider] = nonce;
        self.settled_psy_sent[provider] = sent_psy;
        self.settled_usdt_sent[provider] = sent_usdt;
    }

    // The SD-key transaction must transfer both outputs to provider.
    #[contract_method]
    pub fn remove_liquidity(&mut self, ctx: &mut ChainContext, provider: Felt, burned: Felt, amount_psy: Felt, amount_usdt: Felt, nonce: Felt) {
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 3 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "wrong order");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[provider], "order already used");
        require(ctx.checkpoint_id <= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "order expired");
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
        require(burned > 0 && burned == ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_shares, "wrong shares");
        let owned = self.shares[provider];
        let total = self.total_shares;
        let rp = self.reserve_psy;
        let ru = self.reserve_usdt;
        require(owned >= burned && total >= burned + 1000, "insufficient shares");
        require(rp <= 10000000 && ru <= 10000000 && total <= 10000000, "invalid reserves");
        require(amount_psy > 0 && amount_usdt > 0 && amount_psy <= rp && amount_usdt <= ru, "invalid output");
        require(amount_psy >= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_min_psy && amount_usdt >= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_min_usdt, "withdrawal limit");
        require(amount_psy * total <= burned * rp && burned * rp < (amount_psy + 1) * total, "wrong PSY withdrawal");
        require(amount_usdt * total <= burned * ru && burned * ru < (amount_usdt + 1) * total, "wrong pUSDT withdrawal");
        self.shares[provider] = owned - burned;
        self.total_shares = total - burned;
        self.reserve_psy = rp - amount_psy;
        self.reserve_usdt = ru - amount_usdt;
        self.consumed_nonce[provider] = nonce;
        self.settled_psy_sent[provider] = sent_psy;
    }
}
