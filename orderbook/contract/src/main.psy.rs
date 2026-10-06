// PSY/pUSDT exact-fill limit-order book. Orders live in their owners' user
// partitions; the public SD-key escrow account matches or cancels them.
// Every escrow operation also needs the registered whole-stack SD-key circuit.

#[derive(FeltSized)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

#[contract]
pub struct PsyUsdtOrderbook {
    // Keep the token Outbox prefix identical to PSY (0) and pUSDT (4).
    pub token_balance_view: Felt,
    pub token_reserved_1_view: Felt,
    pub token_reserved_2_view: Felt,
    pub other_user_info: ContractStateArray<1073741824, OtherUserInfo>,

    // Pool-account cursors prevent replay and bind a claim to one order.
    pub consumed_nonce: ContractStateArray<16777216, Felt>,
    pub settled_psy_sent: ContractStateArray<16777216, Felt>,
    pub settled_usdt_sent: ContractStateArray<16777216, Felt>,

    // One outstanding order in each owner's own user partition.
    pub order_kind: Felt,       // 0 empty/abandoned, 1 active sell
    pub order_pool_user: Felt,
    pub order_sell_asset: Felt, // 0 PSY or 4 pUSDT
    pub order_sell_amount: Felt,
    pub order_min_buy: Felt,
    pub order_deadline: Felt,
    pub order_nonce: Felt,

    // Appended cursors retain the original layout and avoid the first slots
    // immediately after the large token-compatible Outbox prefix.
    pub active_consumed_nonce: ContractStateArray<16777216, Felt>,
    pub active_settled_psy_sent: ContractStateArray<16777216, Felt>,
    pub active_settled_usdt_sent: ContractStateArray<16777216, Felt>,
}

#[contract_implementation]
impl PsyUsdtOrderbook {
    #[contract_method]
    pub fn noop(&mut self, ctx: &mut ChainContext) {
        require(ctx.user_id > 0 && ctx.user_id < 16777216, "invalid escrow user");
    }

    #[contract_method]
    pub fn open_sell(&mut self, ctx: &mut ChainContext, pool: Felt, asset: Felt, amount: Felt, min_buy: Felt, deadline: Felt, nonce: Felt) {
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid escrow user");
        require(asset == 0 || asset == 4, "invalid sell asset");
        require(amount > 0 && amount <= 10000000 && min_buy > 0 && min_buy <= 10000000, "invalid order amount");
        require(deadline >= ctx.checkpoint_id, "order already expired");
        require(nonce > self.order_nonce, "nonce must increase");
        require(self.order_kind == 0, "previous order still active");
        self.order_kind = 1;
        self.order_pool_user = pool;
        self.order_sell_asset = asset;
        self.order_sell_amount = amount;
        self.order_min_buy = min_buy;
        self.order_deadline = deadline;
        self.order_nonce = nonce;
    }

    // The owner can release their slot once the escrow has claimed every
    // cumulative payment (as part of an atomic match/refund), or if the order
    // was never funded. Unclaimed payments keep the slot locked.
    #[contract_method]
    pub fn close_psy_order(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 1, "no active order");
        require(self.order_sell_asset == 0, "wrong order asset");
        let pool = self.order_pool_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid escrow user");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let claimed_psy = ctx.users[pool].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_claimed;
        require(sent_psy == claimed_psy, "unclaimed PSY payment keeps order open");
        self.order_kind = 0;
    }

    #[contract_method]
    pub fn close_usdt_order(&mut self, ctx: &mut ChainContext) {
        require(self.order_kind == 1, "no active order");
        require(self.order_sell_asset == 4, "wrong order asset");
        let pool = self.order_pool_user;
        require(pool > 0 && pool < 16777216 && pool != ctx.user_id, "invalid escrow user");
        let sent_psy = ctx.users[ctx.user_id].contract_state::<Self::ABI>(0).other_user_info[pool].amount_sent;
        let claimed_psy = ctx.users[pool].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_claimed;
        require(sent_psy == claimed_psy, "unclaimed PSY payment keeps order open");
        let sent_usdt = ctx.users[ctx.user_id].contract_state::<Self::ABI>(4).other_user_info[pool].amount_sent;
        let claimed_usdt = ctx.users[pool].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_claimed;
        require(sent_usdt == claimed_usdt, "unclaimed pUSDT payment keeps order open");
        self.order_kind = 0;
    }

    // An atomic SD-key stack claims both users' deposits and transfers the
    // two exact outputs. The pUSDT seller's PSY fee escrow is included in its
    // PSY output, so the PSY seller pays this match's network burn.
    #[contract_method]
    pub fn match_orders(&mut self, ctx: &mut ChainContext, psy_seller: Felt, usdt_seller: Felt, amount_psy: Felt, amount_usdt: Felt, psy_nonce: Felt, usdt_nonce: Felt) {
        require(psy_seller > 0 && psy_seller < 16777216 && usdt_seller > 0 && usdt_seller < 16777216, "invalid sellers");
        require(psy_seller != usdt_seller && psy_seller != ctx.user_id && usdt_seller != ctx.user_id, "seller and escrow must differ");
        require(amount_psy > 0 && amount_psy <= 10000000 && amount_usdt > 0 && amount_usdt <= 10000000, "invalid fill amounts");
        require(ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 1, "PSY order missing");
        require(ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_kind == 1, "pUSDT order missing");
        require(ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "wrong PSY escrow");
        require(ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user == ctx.user_id, "wrong pUSDT escrow");
        require(ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_asset == 0, "wrong PSY order asset");
        require(ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_asset == 4, "wrong pUSDT order asset");
        require(ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_amount == amount_psy, "wrong PSY amount");
        require(ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_amount == amount_usdt, "wrong pUSDT amount");
        require(amount_usdt >= ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_min_buy, "PSY seller price not met");
        require(amount_psy >= ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_min_buy, "pUSDT seller price not met");
        require(ctx.checkpoint_id <= ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "PSY order expired");
        require(ctx.checkpoint_id <= ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_deadline, "pUSDT order expired");
        require(ctx.users[psy_seller].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == psy_nonce && psy_nonce > self.active_consumed_nonce[psy_seller], "PSY order already used");
        require(ctx.users[usdt_seller].contract_state::<Self::ABI>(ctx.contract_id).order_nonce == usdt_nonce && usdt_nonce > self.active_consumed_nonce[usdt_seller], "pUSDT order already used");

        let psy_sent_by_psy_seller = ctx.users[psy_seller].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let psy_sent_by_usdt_seller = ctx.users[usdt_seller].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let usdt_sent_by_usdt_seller = ctx.users[usdt_seller].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent;
        require(psy_sent_by_psy_seller >= self.active_settled_psy_sent[psy_seller] && psy_sent_by_psy_seller - self.active_settled_psy_sent[psy_seller] == amount_psy + 1000100000, "PSY payment mismatch");
        require(psy_sent_by_usdt_seller >= self.active_settled_psy_sent[usdt_seller] && psy_sent_by_usdt_seller - self.active_settled_psy_sent[usdt_seller] == 1000100000, "pUSDT seller fee mismatch");
        require(usdt_sent_by_usdt_seller >= self.active_settled_usdt_sent[usdt_seller] && usdt_sent_by_usdt_seller - self.active_settled_usdt_sent[usdt_seller] == amount_usdt, "pUSDT payment mismatch");
        self.active_consumed_nonce[psy_seller] = psy_nonce;
        self.active_consumed_nonce[usdt_seller] = usdt_nonce;
        self.active_settled_psy_sent[psy_seller] = psy_sent_by_psy_seller;
        self.active_settled_psy_sent[usdt_seller] = psy_sent_by_usdt_seller;
        self.active_settled_usdt_sent[usdt_seller] = usdt_sent_by_usdt_seller;
    }

    // Anyone may submit the SD-key cancellation, but it claims and returns
    // only this seller's exact unpaid sell amount to that same seller.
    #[contract_method]
    pub fn cancel_psy_order(&mut self, ctx: &mut ChainContext, seller: Felt, amount: Felt, nonce: Felt) {
        require(seller > 0 && seller < 16777216 && seller != ctx.user_id, "invalid seller");
        require(amount > 0 && amount <= 10000000, "invalid amount");
        let kind = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_kind;
        let pool = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user;
        require(kind == 1 && pool == ctx.user_id, "no active order at this escrow");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_asset == 0, "wrong asset");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_amount == amount, "wrong refund amount");
        let order_nonce = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_nonce;
        let consumed = self.active_consumed_nonce[seller];
        require(order_nonce == nonce && nonce > consumed, "order already used");
        let sent_psy = ctx.users[seller].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.active_settled_psy_sent[seller];
        require(sent_psy >= settled_psy && sent_psy - settled_psy == amount + 1000100000, "PSY refund payment mismatch");
        self.active_settled_psy_sent[seller] = sent_psy;
        self.active_consumed_nonce[seller] = nonce;
    }

    #[contract_method]
    pub fn cancel_usdt_order(&mut self, ctx: &mut ChainContext, seller: Felt, amount: Felt, nonce: Felt) {
        require(seller > 0 && seller < 16777216 && seller != ctx.user_id, "invalid seller");
        require(amount > 0 && amount <= 10000000, "invalid amount");
        let kind = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_kind;
        let pool = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_pool_user;
        require(kind == 1 && pool == ctx.user_id, "no active order at this escrow");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_asset == 4, "wrong asset");
        require(ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_sell_amount == amount, "wrong refund amount");
        let order_nonce = ctx.users[seller].contract_state::<Self::ABI>(ctx.contract_id).order_nonce;
        let consumed = self.active_consumed_nonce[seller];
        require(order_nonce == nonce && nonce > consumed, "order already used");
        let sent_psy = ctx.users[seller].contract_state::<Self::ABI>(0).other_user_info[ctx.user_id].amount_sent;
        let settled_psy = self.active_settled_psy_sent[seller];
        let sent_usdt = ctx.users[seller].contract_state::<Self::ABI>(4).other_user_info[ctx.user_id].amount_sent;
        let settled_usdt = self.active_settled_usdt_sent[seller];
        require(sent_psy >= settled_psy && sent_psy - settled_psy == 1000100000, "fee escrow mismatch");
        require(sent_usdt >= settled_usdt && sent_usdt - settled_usdt == amount, "pUSDT refund payment mismatch");
        self.active_settled_usdt_sent[seller] = sent_usdt;
        self.active_settled_psy_sent[seller] = sent_psy;
        self.active_consumed_nonce[seller] = nonce;
    }
}
