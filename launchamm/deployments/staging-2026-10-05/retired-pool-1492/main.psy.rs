// PSY/launch-token AMM seeded only by an authenticated curve graduation.
// First 26 state fields intentionally match the reviewed curve ABI.
#[derive(FeltSized)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

#[contract]
pub struct PsyLaunchAmm {
    // Compatible Outbox prefix at slots 0..3 for PSY and PsyLaunchToken.
    pub token_balance_view: Felt,
    pub token_reserved_1_view: Felt,
    pub token_reserved_2_view: Felt,
    pub other_user_info: ContractStateArray<1073741824, OtherUserInfo>,

    // Vault-owned launch state. 0 uninitialized, 1 trading, 2 graduated.
    pub phase: Felt,
    pub token_contract_id: Felt,
    pub issuer_user: Felt,
    pub graduation_target: Felt,
    pub max_lots: Felt,
    pub liquidity_lots: Felt,
    pub lot_size: Felt,
    pub base_price: Felt,
    pub step_price: Felt,
    pub threshold_lots: Felt,
    pub sold_lots: Felt,
    pub psy_reserve: Felt,
    pub consumed_nonce: ContractStateArray<16777216, Felt>,
    pub settled_psy_sent: ContractStateArray<16777216, Felt>,
    pub settled_token_sent: ContractStateArray<16777216, Felt>,

    // One payer-signed intent per user partition. 1 buy, 2 sell.
    pub order_kind: Felt,
    pub order_vault_user: Felt,
    pub order_lots: Felt,
    pub order_expected_sold: Felt,
    pub order_psy_quote: Felt,
    pub order_deadline: Felt,
    pub order_nonce: Felt,
    // AMM accounting in bounded trading units, not token base units.
    pub reserve_psy: Felt,
    pub reserve_token: Felt,
    pub total_shares: Felt,
    pub shares: ContractStateArray<16777216, Felt>,
    pub psy_unit: Felt,
    pub token_unit: Felt,
    pub source_curve: Felt,
    pub source_vault: Felt,
    pub order_asset: Felt,
    pub order_amount_psy: Felt,
    pub order_amount_token: Felt,
    pub order_min_out: Felt,
    pub order_shares: Felt,
    pub order_min_psy: Felt,
    pub order_min_token: Felt,
}

#[contract_implementation]
impl PsyLaunchAmm {
    // The public policy fixes source IDs, issuer, token and trading units.
    // Six-call UPS: guard, source PSY claim, source token claim, issuer fee
    // claim, noop, automatic burn. Nothing can be partially initialized.
    #[contract_method]
    pub fn seed_from_curve(&mut self, ctx: &mut ChainContext, curve: Felt, vault: Felt, token: Felt, issuer: Felt, psy_unit: Felt, token_unit: Felt, psy_units: Felt, token_units: Felt, minted: Felt) {
        require(self.phase == 0, "already initialized");
        require(curve >= 5 && curve != ctx.contract_id && token >= 5 && token != curve && token != ctx.contract_id, "invalid contracts");
        require(vault > 0 && vault < 16777216 && vault != ctx.user_id && issuer > 0 && issuer < 16777216 && issuer != ctx.user_id && issuer != vault, "invalid source users");
        require(psy_unit > 0 && psy_unit <= 100000000 && token_unit > 0 && token_unit <= 100000000, "invalid trading units");
        require(psy_units > 0 && psy_units <= 10000000 && token_units > 0 && token_units <= 10000000, "reserve cap exceeded");
        require(ctx.users[vault].contract_state::<Self::ABI>(curve).phase == 2, "curve not graduated");
        require(ctx.users[vault].contract_state::<Self::ABI>(curve).graduation_target == ctx.user_id, "wrong graduation target");
        require(ctx.users[vault].contract_state::<Self::ABI>(curve).token_contract_id == token && ctx.users[vault].contract_state::<Self::ABI>(curve).issuer_user == issuer, "wrong launch binding");
        require(ctx.users[vault].contract_state::<Self::ABI>(curve).psy_reserve == 0, "curve reserve not released");
        let sold = ctx.users[vault].contract_state::<Self::ABI>(curve).sold_lots;
        let cap = ctx.users[vault].contract_state::<Self::ABI>(curve).max_lots;
        let liquidity = ctx.users[vault].contract_state::<Self::ABI>(curve).liquidity_lots;
        let lot = ctx.users[vault].contract_state::<Self::ABI>(curve).lot_size;
        let base = ctx.users[vault].contract_state::<Self::ABI>(curve).base_price;
        let step = ctx.users[vault].contract_state::<Self::ABI>(curve).step_price;
        let threshold = ctx.users[vault].contract_state::<Self::ABI>(curve).threshold_lots;
        require(cap > 0 && cap <= 1000000 && liquidity > 0 && liquidity <= 1000000 && sold >= threshold && sold <= cap && threshold > 0, "invalid graduated supply");
        require(lot > 0 && lot <= 1000000000 && base > 0 && base <= 1000000000 && step > 0 && step <= 10000, "invalid curve amounts");
        let psy_native = base * sold + step * sold * (sold - 1) / 2;
        let token_native = (cap + liquidity - sold) * lot;
        require(psy_units * psy_unit == psy_native && token_units * token_unit == token_native, "inexact graduation units");
        let source_psy = ctx.users[vault].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let source_token = ctx.users[vault].contract_state::<Self::ABI>(token).other_user_info[ctx.user_id].amount_sent;
        let issuer_psy = ctx.users[issuer].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        require(source_psy == psy_native && source_token == token_native && issuer_psy == 1000100000, "graduation payment or seed fee mismatch");
        require(minted > 0 && minted <= 9999000, "invalid seed shares");
        let gross = minted + 1000;
        let product = psy_units * token_units;
        require(gross * gross <= product && product < (gross + 1) * (gross + 1), "wrong seed shares");
        self.token_contract_id = token;
        self.issuer_user = issuer;
        self.psy_unit = psy_unit;
        self.token_unit = token_unit;
        self.source_curve = curve;
        self.source_vault = vault;
        self.reserve_psy = psy_units;
        self.reserve_token = token_units;
        self.total_shares = gross;
        self.shares[issuer] = minted;
        self.settled_psy_sent[vault] = source_psy;
        self.settled_token_sent[vault] = source_token;
        self.settled_psy_sent[issuer] = issuer_psy;
        self.phase = 1;
    }

    // Fixed-length SD-key transaction stacks use this zero-input, read-only
    // call as padding. The fingerprint must bind its exact method and inputs.
    #[contract_method]
    pub fn noop(&mut self, ctx: &mut ChainContext) {
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
    }

    #[contract_method]
    pub fn open_swap(&mut self, ctx: &mut ChainContext, pool: Felt, asset: Felt, amount_in: Felt, min_out: Felt, deadline: Felt, nonce: Felt) {
        require(ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).phase == 1, "pool not initialized");
        let token_id = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        require(asset == 0 || asset == token_id, "invalid asset");
        require(self.order_kind == 0, "previous order still active");
        require(amount_in > 0 && amount_in <= 10000000, "input exceeds bounded pool limit");
        require(min_out > 0 && min_out <= 10000000, "invalid min out");
        require(deadline >= ctx.checkpoint_id, "expired order");
        require(nonce > self.order_nonce, "order nonce must increase");
        self.order_kind = 1;
        self.order_vault_user = pool;
        self.order_asset = asset;
        if asset == 0 {
            self.order_amount_psy = amount_in;
            self.order_amount_token = 0;
        } else {
            self.order_amount_psy = 0;
            self.order_amount_token = amount_in;
        }
        self.order_min_out = min_out;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    #[contract_method]
    pub fn open_add(&mut self, ctx: &mut ChainContext, pool: Felt, amount_psy: Felt, amount_token: Felt, min_shares: Felt, deadline: Felt, nonce: Felt) {
        require(ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).phase == 1, "pool not initialized");
        let token_id = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        require(self.order_kind == 0, "previous order still active");
        require(amount_psy > 0 && amount_psy <= 10000000, "invalid PSY amount");
        require(amount_token > 0 && amount_token <= 10000000, "invalid launch token amount");
        require(min_shares > 0 && min_shares <= 10000000, "invalid share limit");
        require(deadline >= ctx.checkpoint_id, "expired order");
        require(nonce > self.order_nonce, "order nonce must increase");
        self.order_kind = 2;
        self.order_vault_user = pool;
        self.order_amount_psy = amount_psy;
        self.order_amount_token = amount_token;
        self.order_min_out = min_shares;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    #[contract_method]
    pub fn open_remove(&mut self, ctx: &mut ChainContext, pool: Felt, shares: Felt, min_psy: Felt, min_token: Felt, deadline: Felt, nonce: Felt) {
        require(ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).phase == 1, "pool not initialized");
        let token_id = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        require(self.order_kind == 0, "previous order still active");
        require(shares > 0 && shares <= 10000000, "invalid shares");
        require(min_psy > 0 && min_token > 0, "invalid withdrawal limit");
        require(deadline >= ctx.checkpoint_id, "expired order");
        require(nonce > self.order_nonce, "order nonce must increase");
        self.order_kind = 3;
        self.order_vault_user = pool;
        self.order_shares = shares;
        self.order_min_psy = min_psy;
        self.order_min_token = min_token;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    // A payer releases their local order slot only after the pool's guarded
    // settlement cursors cover every payment sent. Split asset paths so a PSY-only proof
    // never reads an unused launch token state partition.
    #[contract_method]
    pub fn close_psy_swap(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 1 && self.order_asset == 0, "no PSY swap order");
        let pool = self.order_vault_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled PSY payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_token_swap(&mut self, ctx: &mut ChainContext) {
        let pool = self.order_vault_user;
        let token_id = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(self.order_kind == 1 && self.order_asset == token_id, "no launch token swap order");
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled fee payment keeps order open");
        let sent_token = ctx.users[ctx.user_id].contract_state::<Self::ABI>(token_id).other_user_info[pool].amount_sent;
        let settled_token = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_token_sent[ctx.user_id];
        require(sent_token == settled_token, "unsettled launch token payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_add(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 2, "no liquidity add order");
        let pool = self.order_vault_user;
        let token_id = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled PSY payment keeps order open");
        let sent_token = ctx.users[ctx.user_id].contract_state::<Self::ABI>(token_id).other_user_info[pool].amount_sent;
        let settled_token = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_token_sent[ctx.user_id];
        require(sent_token == settled_token, "unsettled launch token payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_remove(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 3, "no liquidity remove order");
        let pool = self.order_vault_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid pool");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let settled_psy = ctx.users[pool].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled fee payment keeps order open");
        self.order_kind = 0;
    }

    // Each operation requires a separate 1.0001 PSY fee escrow in the payer's
    // cumulative PSY Outbox. The pool refunds the full asset amount and keeps
    // only the fee escrow to cover the automatic network burn.
    #[contract_method]
    pub fn refund_unclaimed(&mut self, ctx: &mut ChainContext, sender: Felt, asset: Felt, amount: Felt) {
        require(self.phase == 1, "pool not initialized");
        let token_id = self.token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(asset == 0 || asset == token_id, "invalid asset");
        require(sender > 0 && sender < 16777216 && sender != ctx.user_id, "invalid sender");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require(amount > 0 && amount <= 10000000, "invalid refund amount");
        let kind = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_kind;
        let pool = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user;
        require(kind == 1 && pool == ctx.user_id, "no swap order");
        require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_asset == asset, "wrong refund asset");
        if asset == 0 {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount, "PSY refund must match payer order");
        } else {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_token == amount, "launch token refund must match payer order");
        }
        let sent_psy = ctx.users[sender].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[sender];
        require(sent_psy > settled_psy, "no fee escrow");
        if asset == 0 {
            require(sent_psy - settled_psy == amount * self.psy_unit + 1000100000, "PSY refund or fee mismatch");
        } else {
            require(sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
            let sent_token = ctx.users[sender].contract_state::<Self::ABI>(token_id).other_user_info[ctx.user_id].amount_sent;
            let settled_token = self.settled_token_sent[sender];
            require(sent_token > settled_token && sent_token - settled_token == amount * self.token_unit, "launch token refund mismatch");
            self.settled_token_sent[sender] = sent_token;
        }
        self.settled_psy_sent[sender] = sent_psy;
    }

    // Refund exactly the assets already paid for an LP add. The caller uses
    // zero for a leg that was never paid. Both legs, when present, must be
    // claimed and returned in the same transaction, sharing one fee escrow.
    #[contract_method]
    pub fn refund_add_unclaimed(&mut self, ctx: &mut ChainContext, provider: Felt, amount_psy: Felt, amount_token: Felt) {
        require(self.phase == 1, "pool not initialized");
        let token_id = self.token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require((amount_psy > 0 || amount_token > 0) && amount_psy <= 10000000 && amount_token <= 10000000, "invalid refund amounts");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 2 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "no LP add order");
        if amount_psy > 0 {
            require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount_psy, "wrong PSY refund amount");
        }
        if amount_token > 0 {
            require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_token == amount_token, "wrong launch token refund amount");
        }
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        let sent_token = ctx.users[provider].contract_state::<Self::ABI>(token_id).other_user_info[ctx.user_id].amount_sent;
        let settled_token = self.settled_token_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == amount_psy * self.psy_unit + 1000100000, "PSY refund or fee mismatch");
        require(sent_token >= settled_token && sent_token - settled_token == amount_token * self.token_unit, "launch token refund mismatch");
        self.settled_psy_sent[provider] = sent_psy;
        self.settled_token_sent[provider] = sent_token;
    }

    // The SD-key transaction must then claim the exact input token and
    // transfer amount_out of the opposite token to the same sender.
    #[contract_method]
    pub fn swap(&mut self, ctx: &mut ChainContext, sender: Felt, asset: Felt, amount_in: Felt, amount_out: Felt, nonce: Felt) {
        require(self.phase == 1, "pool not initialized");
        let token_id = self.token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(asset == 0 || asset == token_id, "invalid asset");
        require(sender > 0 && sender < 16777216 && sender != ctx.user_id, "invalid sender");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require(amount_in > 0 && amount_in <= 10000000, "input exceeds bounded pool limit");
        require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 1 && ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong order");
        require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_asset == asset && ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce, "wrong order input");
        require(nonce > self.consumed_nonce[sender], "order already used");
        require(ctx.checkpoint_id <= ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "order expired");
        if asset == 0 {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount_in, "wrong PSY input");
        } else {
            require(ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_amount_token == amount_in, "wrong launch token input");
        }
        let sent_psy = ctx.users[sender].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[sender];
        require(sent_psy > settled_psy, "missing PSY fee escrow");
        if asset == 0 {
            require(sent_psy - settled_psy == amount_in * self.psy_unit + 1000100000, "PSY swap or fee mismatch");
        } else {
            require(sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
            let sent_token = ctx.users[sender].contract_state::<Self::ABI>(token_id).other_user_info[ctx.user_id].amount_sent;
            let settled_token = self.settled_token_sent[sender];
            require(sent_token > settled_token && sent_token - settled_token == amount_in * self.token_unit, "launch token swap mismatch");
            self.settled_token_sent[sender] = sent_token;
        }
        if asset == 0 {
            let reserve_in = self.reserve_psy;
            let reserve_out = self.reserve_token;
            require(reserve_in > 0 && reserve_out > 0, "pool empty");
            require(reserve_in <= 10000000 - amount_in, "reserve cap exceeded");
            require(amount_out > 0 && amount_out < reserve_out && amount_out >= ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_min_out, "slippage or invalid output");
            // All quote products are below 2*10^18, below the field modulus.
            let numerator = amount_in * 9970 * reserve_out;
            let denominator = reserve_in * 10000 + amount_in * 9970;
            require(amount_out * denominator <= numerator, "output above exact quote");
            require(numerator < (amount_out + 1) * denominator, "output below exact quote");
            self.reserve_psy = reserve_in + amount_in;
            self.reserve_token = reserve_out - amount_out;
        } else {
            let reserve_in = self.reserve_token;
            let reserve_out = self.reserve_psy;
            require(reserve_in > 0 && reserve_out > 0, "pool empty");
            require(reserve_in <= 10000000 - amount_in, "reserve cap exceeded");
            require(amount_out > 0 && amount_out < reserve_out && amount_out >= ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).order_min_out, "slippage or invalid output");
            let numerator = amount_in * 9970 * reserve_out;
            let denominator = reserve_in * 10000 + amount_in * 9970;
            require(amount_out * denominator <= numerator, "output above exact quote");
            require(numerator < (amount_out + 1) * denominator, "output below exact quote");
            self.reserve_token = reserve_in + amount_in;
            self.reserve_psy = reserve_out - amount_out;
        }
        self.consumed_nonce[sender] = nonce;
        self.settled_psy_sent[sender] = sent_psy;
    }

    // The SD-key transaction must claim both deposits from provider.
    #[contract_method]
    pub fn add_liquidity(&mut self, ctx: &mut ChainContext, provider: Felt, amount_psy: Felt, amount_token: Felt, minted: Felt, nonce: Felt) {
        require(self.phase == 1, "pool not initialized");
        let token_id = self.token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid pool user");
        require(amount_psy > 0 && amount_token > 0, "zero liquidity");
        require(amount_psy <= 10000000 && amount_token <= 10000000, "deposit cap exceeded");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 2 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong order");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_psy == amount_psy && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_amount_token == amount_token, "wrong deposit amounts");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[provider], "order already used");
        require(ctx.checkpoint_id <= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "order expired");
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        let sent_token = ctx.users[provider].contract_state::<Self::ABI>(token_id).other_user_info[ctx.user_id].amount_sent;
        let settled_token = self.settled_token_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == amount_psy * self.psy_unit + 1000100000, "PSY deposit or fee mismatch");
        require(sent_token > settled_token && sent_token - settled_token == amount_token * self.token_unit, "launch token deposit delta mismatch");
        let rp = self.reserve_psy;
        let ru = self.reserve_token;
        let total = self.total_shares;
        require(amount_psy <= 10000000 - rp && amount_token <= 10000000 - ru, "reserve cap exceeded");
        require(minted > 0 && minted >= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_min_out, "share limit");
        if total == 0 {
            require(rp == 0 && ru == 0, "invalid initial reserves");
            require(minted <= 10000000 - 1000, "initial share cap exceeded");
            let gross = minted + 1000;
            let product = amount_psy * amount_token;
            require(gross * gross <= product, "initial shares too high");
            require(product < (gross + 1) * (gross + 1), "initial shares too low");
            self.total_shares = gross;
        } else {
            require(rp > 0 && ru > 0 && total <= 10000000, "invalid reserves");
            require(amount_psy * ru == amount_token * rp, "deposit ratio mismatch");
            require(minted * rp <= amount_psy * total && amount_psy * total < (minted + 1) * rp, "wrong PSY shares");
            require(minted * ru <= amount_token * total && amount_token * total < (minted + 1) * ru, "wrong launch token shares");
            require(minted <= 10000000 - total, "share cap exceeded");
            self.total_shares = total + minted;
        }
        let owned = self.shares[provider];
        require(owned <= 10000000 - minted, "share balance overflow");
        self.shares[provider] = owned + minted;
        self.reserve_psy = rp + amount_psy;
        self.reserve_token = ru + amount_token;
        self.consumed_nonce[provider] = nonce;
        self.settled_psy_sent[provider] = sent_psy;
        self.settled_token_sent[provider] = sent_token;
    }

    // The SD-key transaction must transfer both outputs to provider.
    #[contract_method]
    pub fn remove_liquidity(&mut self, ctx: &mut ChainContext, provider: Felt, burned: Felt, amount_psy: Felt, amount_token: Felt, nonce: Felt) {
        require(self.phase == 1, "pool not initialized");
        let token_id = self.token_contract_id;
        require(token_id >= 5, "invalid launch token");
        require(provider > 0 && provider < 16777216 && provider != ctx.user_id, "invalid provider");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 3 && ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong order");
        require(ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[provider], "order already used");
        require(ctx.checkpoint_id <= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "order expired");
        let sent_psy = ctx.users[provider].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[provider];
        require(sent_psy > settled_psy && sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
        require(burned > 0 && burned == ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_shares, "wrong shares");
        let owned = self.shares[provider];
        let total = self.total_shares;
        let rp = self.reserve_psy;
        let ru = self.reserve_token;
        require(owned >= burned && total >= burned + 1000, "insufficient shares");
        require(rp <= 10000000 && ru <= 10000000 && total <= 10000000, "invalid reserves");
        require(amount_psy > 0 && amount_token > 0 && amount_psy <= rp && amount_token <= ru, "invalid output");
        require(amount_psy >= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_min_psy && amount_token >= ctx.users[provider].contract_state::<Self::ABI>(ctx.contract_id).order_min_token, "withdrawal limit");
        require(amount_psy * total <= burned * rp && burned * rp < (amount_psy + 1) * total, "wrong PSY withdrawal");
        require(amount_token * total <= burned * ru && burned * ru < (amount_token + 1) * total, "wrong launch token withdrawal");
        self.shares[provider] = owned - burned;
        self.total_shares = total - burned;
        self.reserve_psy = rp - amount_psy;
        self.reserve_token = ru - amount_token;
        self.consumed_nonce[provider] = nonce;
        self.settled_psy_sent[provider] = sent_psy;
    }
}
