// Fixed-inventory launch curve for the companion PsyLaunchToken paid in PSY.
// This contract is the accounting guard. The vault MUST register the matching
// whole-UPS SD-key fingerprint before anyone funds it.

#[derive(FeltSized)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

#[contract]
pub struct PsyBondingCurve {
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
}

#[contract_implementation]
impl PsyBondingCurve {
    #[contract_method]
    pub fn noop(&mut self, ctx: &mut ChainContext) {
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid vault user");
    }

    // The issuer pre-funds exactly (max_lots + liquidity_lots) * lot_size token
    // units and one PSY fee escrow. The SD-key stack claims both payments.
    #[contract_method]
    pub fn initialize(&mut self, ctx: &mut ChainContext, token_id: Felt, issuer: Felt, target: Felt, sale_cap: Felt, liquidity: Felt, unit: Felt, base: Felt, step: Felt, threshold: Felt) {
        require(self.phase == 0, "already initialized");
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid vault user");
        require(token_id >= 5 && token_id != ctx.contract_id, "invalid launch token");
        require(issuer > 0 && issuer < 16777216 && issuer != ctx.user_id, "invalid issuer");
        require(target > 0 && target < 16777216 && target != ctx.user_id && target != issuer, "invalid graduation target");
        require(sale_cap > 0 && sale_cap <= 1000000 && liquidity > 0 && liquidity <= 1000000, "invalid inventory lots");
        require(unit > 0 && unit <= 1000000000, "invalid lot size");
        require(base > 0 && base <= 1000000000 && step > 0 && step <= 10000, "invalid curve parameters");
        require(threshold > 0 && threshold <= sale_cap, "invalid graduation threshold");
        let inventory = (sale_cap + liquidity) * unit;
        let sent_token = ctx.users[issuer].contract_state::<Self::ABI>(token_id).other_user_info[ctx.user_id].amount_sent;
        let sent_psy = ctx.users[issuer].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        require(sent_token == inventory && sent_psy == 1000100000, "issuer inventory or fee mismatch");
        self.token_contract_id = token_id;
        self.issuer_user = issuer;
        self.graduation_target = target;
        self.max_lots = sale_cap;
        self.liquidity_lots = liquidity;
        self.lot_size = unit;
        self.base_price = base;
        self.step_price = step;
        self.threshold_lots = threshold;
        self.settled_token_sent[issuer] = sent_token;
        self.settled_psy_sent[issuer] = sent_psy;
        self.phase = 1;
    }

    // The buyer signs this intent and an exact (quote + fee escrow) PSY payment.
    // Supply changes invalidate the quote; the full input can then be refunded.
    #[contract_method]
    pub fn open_buy(&mut self, ctx: &mut ChainContext, vault: Felt, lots: Felt, expected_sold: Felt, cost: Felt, deadline: Felt, nonce: Felt) {
        require(vault > 0 && vault < 16777216 && vault != ctx.user_id, "invalid vault");
        require(ctx.users[vault].contract_state::<Self::ABI>(ctx.contract_id).phase == 1, "vault not trading");
        require(self.order_kind == 0, "previous order still active");
        require(lots > 0 && lots <= 1000000 && expected_sold <= 1000000, "invalid lots");
        require(cost > 0 && cost <= 6000000000000000, "invalid quoted cost");
        require(deadline >= ctx.checkpoint_id && nonce > self.order_nonce, "expired or replayed order");
        self.order_kind = 1;
        self.order_vault_user = vault;
        self.order_lots = lots;
        self.order_expected_sold = expected_sold;
        self.order_psy_quote = cost;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    // The seller signs this intent, transfers lots * lot_size token units,
    // and pays one PSY fee escrow to the vault in the same opening UPS.
    #[contract_method]
    pub fn open_sell(&mut self, ctx: &mut ChainContext, vault: Felt, lots: Felt, expected_sold: Felt, payout: Felt, deadline: Felt, nonce: Felt) {
        require(vault > 0 && vault < 16777216 && vault != ctx.user_id, "invalid vault");
        require(ctx.users[vault].contract_state::<Self::ABI>(ctx.contract_id).phase == 1, "vault not trading");
        require(self.order_kind == 0, "previous order still active");
        require(lots > 0 && lots <= 1000000 && expected_sold <= 1000000, "invalid lots");
        require(payout > 0 && payout <= 6000000000000000, "invalid quoted payout");
        require(deadline >= ctx.checkpoint_id && nonce > self.order_nonce, "expired or replayed order");
        self.order_kind = 2;
        self.order_vault_user = vault;
        self.order_lots = lots;
        self.order_expected_sold = expected_sold;
        self.order_psy_quote = payout;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    #[contract_method]
    pub fn close_buy(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 1, "no buy order");
        let vault = self.order_vault_user;
        require(vault > 0 && vault < 16777216 && vault != ctx.user_id, "invalid vault");
        let sent = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[vault].amount_sent;
        let settled = ctx.users[vault].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent == settled, "unsettled PSY payment");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_sell(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 2, "no sell order");
        let vault = self.order_vault_user;
        require(vault > 0 && vault < 16777216 && vault != ctx.user_id, "invalid vault");
        let token_id = ctx.users[vault].contract_state::<Self::ABI>(ctx.contract_id).token_contract_id;
        require(token_id >= 5, "vault not initialized");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[vault].amount_sent;
        let settled_psy = ctx.users[vault].contract_state::<Self::ABI>(ctx.contract_id).settled_psy_sent[ctx.user_id];
        require(sent_psy == settled_psy, "unsettled fee payment");
        let sent_token = ctx.users[ctx.user_id].contract_state::<Self::ABI>(token_id).other_user_info[vault].amount_sent;
        let settled_token = ctx.users[vault].contract_state::<Self::ABI>(ctx.contract_id).settled_token_sent[ctx.user_id];
        require(sent_token == settled_token, "unsettled token payment");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn settle_buy(&mut self, ctx: &mut ChainContext, buyer: Felt, lots: Felt, cost: Felt, nonce: Felt) {
        require(self.phase == 1, "curve not trading");
        require(buyer > 0 && buyer < 16777216 && buyer != ctx.user_id, "invalid buyer");
        require(lots > 0 && lots <= self.max_lots - self.sold_lots, "sale cap exceeded");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 1 && ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong buy order");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_lots == lots && ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_psy_quote == cost, "wrong buy amounts");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_expected_sold == self.sold_lots, "stale buy quote");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[buyer], "buy replay");
        require(ctx.checkpoint_id <= ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "buy expired");
        let slope_units = lots * (2 * self.sold_lots + lots - 1) / 2;
        let expected_cost = self.base_price * lots + self.step_price * slope_units;
        require(cost == expected_cost, "incorrect curve price");
        let sent = ctx.users[buyer].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled = self.settled_psy_sent[buyer];
        require(sent >= settled && sent - settled == cost + 1000100000, "buy payment mismatch");
        self.sold_lots += lots;
        self.psy_reserve += cost;
        self.settled_psy_sent[buyer] = sent;
        self.consumed_nonce[buyer] = nonce;
    }

    #[contract_method]
    pub fn settle_sell(&mut self, ctx: &mut ChainContext, seller: Felt, lots: Felt, payout: Felt, nonce: Felt) {
        require(self.phase == 1, "curve not trading");
        require(seller > 0 && seller < 16777216 && seller != ctx.user_id, "invalid seller");
        require(lots > 0 && lots <= self.sold_lots, "sell exceeds circulating lots");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 2 && ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong sell order");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_lots == lots && ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_psy_quote == payout, "wrong sell amounts");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_expected_sold == self.sold_lots, "stale sell quote");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[seller], "sell replay");
        require(ctx.checkpoint_id <= ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "sell expired");
        let slope_units = lots * (2 * self.sold_lots - lots - 1) / 2;
        let expected_payout = self.base_price * lots + self.step_price * slope_units;
        require(payout == expected_payout && payout <= self.psy_reserve, "incorrect or insolvent payout");
        let sent_psy = ctx.users[seller].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[seller];
        require(sent_psy >= settled_psy && sent_psy - settled_psy == 1000100000, "sell fee mismatch");
        let sent_token = ctx.users[seller].contract_state::<Self::ABI>(self.token_contract_id).other_user_info[ctx.user_id].amount_sent;
        let settled_token = self.settled_token_sent[seller];
        require(sent_token >= settled_token && sent_token - settled_token == lots * self.lot_size, "sell token mismatch");
        self.sold_lots -= lots;
        self.psy_reserve -= payout;
        self.settled_psy_sent[seller] = sent_psy;
        self.settled_token_sent[seller] = sent_token;
        self.consumed_nonce[seller] = nonce;
    }

    // Refunds remain available after graduation for stale funded orders.
    #[contract_method]
    pub fn refund_buy(&mut self, ctx: &mut ChainContext, buyer: Felt, lots: Felt, cost: Felt, nonce: Felt) {
        require(self.phase == 1 || self.phase == 2, "vault not initialized");
        require(buyer > 0 && buyer < 16777216 && buyer != ctx.user_id, "invalid buyer");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 1 && ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong buy order");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_lots == lots && ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_psy_quote == cost, "wrong refund amounts");
        require(ctx.users[buyer].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[buyer], "buy already used");
        let sent = ctx.users[buyer].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled = self.settled_psy_sent[buyer];
        require(sent >= settled && sent - settled == cost + 1000100000, "buy refund payment mismatch");
        self.settled_psy_sent[buyer] = sent;
        self.consumed_nonce[buyer] = nonce;
    }

    #[contract_method]
    pub fn refund_sell(&mut self, ctx: &mut ChainContext, seller: Felt, lots: Felt, nonce: Felt) {
        require(self.phase == 1 || self.phase == 2, "vault not initialized");
        require(seller > 0 && seller < 16777216 && seller != ctx.user_id, "invalid seller");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 2 && ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_vault_user == ctx.user_id, "wrong sell order");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_lots == lots, "wrong refund lots");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == nonce && nonce > self.consumed_nonce[seller], "sell already used");
        let sent_psy = ctx.users[seller].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.settled_psy_sent[seller];
        require(sent_psy >= settled_psy && sent_psy - settled_psy == 1000100000, "sell refund fee mismatch");
        let sent_token = ctx.users[seller].contract_state::<Self::ABI>(self.token_contract_id).other_user_info[ctx.user_id].amount_sent;
        let settled_token = self.settled_token_sent[seller];
        require(sent_token >= settled_token && sent_token - settled_token == lots * self.lot_size, "sell refund token mismatch");
        self.settled_psy_sent[seller] = sent_psy;
        self.settled_token_sent[seller] = sent_token;
        self.consumed_nonce[seller] = nonce;
    }

    // Graduation closes trading and transfers all curve backing plus every
    // unsold token lot to the configured successor vault. Seeding that vault's
    // market is a separate, authorized transaction.
    #[contract_method]
    pub fn graduate(&mut self, ctx: &mut ChainContext, target: Felt, psy_amount: Felt, token_amount: Felt) {
        require(self.phase == 1 && self.sold_lots >= self.threshold_lots, "threshold not reached");
        require(target == self.graduation_target, "wrong graduation target");
        require(psy_amount == self.psy_reserve && psy_amount > 0, "wrong reserve transfer");
        require(token_amount == (self.max_lots + self.liquidity_lots - self.sold_lots) * self.lot_size, "wrong token transfer");
        require(token_amount > 0, "no liquidity inventory");
        let issuer = self.issuer_user;
        let sent = ctx.users[issuer].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled = self.settled_psy_sent[issuer];
        require(sent >= settled && sent - settled == 1000100000, "graduation fee mismatch");
        self.settled_psy_sent[issuer] = sent;
        self.psy_reserve = 0;
        self.phase = 2;
    }
}
