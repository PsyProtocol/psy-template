// Staging-compatible PSY-20 core with cooperative delegation settlement.
// The legacy private note methods are not exposed here: the 0.1.1 compiler
// does not expose the session-proof intrinsics required by private_claim.

#[derive(FeltSized)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

#[derive(FeltSized)]
pub struct DelegationChannel {
    pub spender: Felt,
    pub allocated_amount: Felt,
    pub channel_version: Felt,
    pub status: Felt,
}

#[derive(FeltSized)]
pub struct DelegationSpend {
    pub spent: Felt,
    pub closed: Felt,
    pub channel_version: Felt,
}

const ISSUER_USER_ID: usize = 5;

#[contract]
pub struct PsyTokenContract {
    pub balance: Felt,
    pub mint_authority: Felt,
    pub is_mint_renounced: Felt,
    pub total_minted: Felt,
    pub total_supply: Felt,
    pub max_supply: Felt,
    pub burn_requested: Felt,
    pub burn_settled: ContractStateArray<16777216, Felt>,
    pub symbol: Felt,
    pub decimals: Felt,
    pub name: [Felt; 2],
    pub token_uri: [Felt; 5],
    pub other_user_info: ContractStateArray<16777216, OtherUserInfo>,
    pub delegations: ContractStateArray<16, DelegationChannel>,
    pub delegation_spends: ContractStateArray<268435456, DelegationSpend>,
}

#[contract_implementation]
impl PsyTokenContract {
    #[contract_method]
    pub fn set_metadata(&mut self, ctx: &mut ChainContext, symbol: Felt, decimals: Felt) {
        require(ctx.user_id == ISSUER_USER_ID, "caller is not in canonical issuer partition");
        require(self.is_mint_renounced == 0, "token administration has been renounced");
        require(decimals <= 18, "decimals exceed maximum supported precision");
        if self.mint_authority == 0 {
            self.mint_authority = ctx.user_id;
        } else {
            require(self.mint_authority == ctx.user_id, "caller is not mint authority");
        }
        self.symbol = symbol;
        self.decimals = decimals;
        psystd::emit_event(1, symbol, decimals);
    }

    #[contract_method]
    pub fn set_extended_metadata(&mut self, ctx: &mut ChainContext, name: [Felt; 2], token_uri: [Felt; 5]) {
        require(ctx.user_id == ISSUER_USER_ID, "only issuer can set extended metadata");
        require(self.is_mint_renounced == 0, "token administration has been renounced");
        require(self.mint_authority == ctx.user_id, "mint authority not initialized");
        self.name = name;
        self.token_uri = token_uri;
        psystd::emit_event(12, name, token_uri);
    }

    #[contract_method]
    pub fn set_max_supply(&mut self, ctx: &mut ChainContext, cap: Felt) {
        require(ctx.user_id == ISSUER_USER_ID, "only issuer can set max supply");
        require(self.is_mint_renounced == 0, "minting has been renounced");
        require(self.mint_authority == ctx.user_id, "mint authority not initialized");
        require(self.total_minted == 0 && self.max_supply == 0, "max supply can only be set once before minting");
        require(cap > 0, "max supply must be positive");
        self.max_supply = cap;
        psystd::emit_event(14, cap);
    }

    #[contract_method]
    pub fn mint(&mut self, ctx: &mut ChainContext, amount: Felt) {
        require(amount > 0, "mint amount must be positive");
        require(ctx.user_id == ISSUER_USER_ID, "only designated issuer partition can mint");
        require(self.is_mint_renounced == 0, "minting has been permanently renounced");
        require(self.mint_authority == ctx.user_id, "caller is not mint authority");
        require(amount <= 18446744069414584320 - self.balance, "balance overflow");
        require(amount <= 18446744069414584320 - self.total_minted, "total minted overflow");
        require(self.max_supply == 0 || amount <= self.max_supply - self.total_minted, "max supply exceeded");
        require(amount <= 18446744069414584320 - self.total_supply, "total supply overflow");
        self.balance += amount;
        self.total_minted += amount;
        self.total_supply += amount;
        psystd::emit_event(2, ctx.user_id, amount);
    }

    #[contract_method]
    pub fn mint_to(&mut self, ctx: &mut ChainContext, recipient: Felt, amount: Felt) {
        require(ctx.user_id == ISSUER_USER_ID, "only issuer can mint to recipient");
        require(recipient != 0 && recipient < 16777216 && recipient != ctx.user_id, "invalid mint recipient");
        require(amount > 0, "mint amount must be positive");
        require(self.is_mint_renounced == 0, "minting has been permanently renounced");
        require(self.mint_authority == ctx.user_id, "caller is not mint authority");
        require(amount <= 18446744069414584320 - self.total_minted, "total minted overflow");
        require(self.max_supply == 0 || amount <= self.max_supply - self.total_minted, "max supply exceeded");
        require(amount <= 18446744069414584320 - self.total_supply, "total supply overflow");
        let sent = self.other_user_info[recipient].amount_sent;
        require(amount <= 18446744069414584320 - sent, "amount sent overflow");
        self.other_user_info[recipient].amount_sent = sent + amount;
        self.total_minted += amount;
        self.total_supply += amount;
        psystd::emit_event(2, recipient, amount);
    }

    #[contract_method]
    pub fn burn(&mut self, ctx: &mut ChainContext, amount: Felt) {
        require(amount > 0, "burn amount must be positive");
        require(ctx.user_id < 16777216, "burning user_id exceeds settlement bounds");
        require(self.balance >= amount, "insufficient balance to burn");
        require(amount <= 18446744069414584320 - self.burn_requested, "burn request overflow");
        self.balance -= amount;
        self.burn_requested += amount;
        psystd::emit_event(3, ctx.user_id, amount);
    }

    #[contract_method]
    pub fn settle_burn(&mut self, ctx: &mut ChainContext, sender: Felt) {
        require(ctx.user_id == ISSUER_USER_ID, "only issuer can settle burns");
        require(sender != 0 && sender < 16777216, "burn sender out of bounds");
        let requested = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).burn_requested;
        let settled = self.burn_settled[sender];
        require(requested > settled, "no pending burn to settle");
        let amount = requested - settled;
        require(self.total_supply >= amount, "burn exceeds total supply");
        self.burn_settled[sender] = requested;
        self.total_supply -= amount;
        psystd::emit_event(13, sender, amount);
    }

    #[contract_method]
    pub fn set_mint_authority(&mut self, ctx: &mut ChainContext, new_authority: Felt) {
        require(ctx.user_id == ISSUER_USER_ID, "only designated issuer partition can set mint authority");
        require(self.is_mint_renounced == 0, "minting has been renounced");
        require(new_authority == ctx.user_id, "authority cannot leave issuer partition");
        self.mint_authority = new_authority;
        psystd::emit_event(4, new_authority);
    }

    #[contract_method]
    pub fn renounce_mint_authority(&mut self, ctx: &mut ChainContext) {
        require(ctx.user_id == ISSUER_USER_ID, "only designated issuer partition can renounce mint authority");
        require(self.mint_authority != 0, "mint authority not initialized");
        self.is_mint_renounced = 1;
        self.mint_authority = 0;
        psystd::emit_event(4, 0);
    }

    #[contract_method]
    pub fn transfer(&mut self, ctx: &mut ChainContext, recipient: Felt, amount: Felt) {
        require(ctx.user_id < 16777216, "caller user_id exceeds outbox bounds");
        require(recipient != 0 && recipient < 16777216, "recipient user_id exceeds outbox bounds");
        require(recipient != ctx.user_id, "cannot transfer to self");
        require(amount > 0, "transfer amount must be positive");
        require(self.balance >= amount, "insufficient balance");
        let sent = self.other_user_info[recipient].amount_sent;
        require(amount <= 18446744069414584320 - sent, "amount sent overflow");
        self.other_user_info[recipient].amount_sent = sent + amount;
        self.balance -= amount;
        psystd::emit_event(5, ctx.user_id, recipient, amount);
    }

    #[contract_method]
    pub fn claim(&mut self, ctx: &mut ChainContext, sender: Felt) {
        require(ctx.user_id < 16777216, "caller user_id exceeds inbox bounds");
        require(sender != 0 && sender < 16777216, "sender user_id exceeds inbox bounds");
        require(sender != ctx.user_id, "cannot claim from self");
        let sender_total = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id)
            .other_user_info[ctx.user_id].amount_sent;
        let already_claimed = self.other_user_info[sender].amount_claimed;
        require(sender_total > already_claimed, "no tokens to claim from this sender");
        let claimable = sender_total - already_claimed;
        require(claimable <= 18446744069414584320 - self.balance, "balance overflow");
        self.other_user_info[sender].amount_claimed = sender_total;
        self.balance += claimable;
        psystd::emit_event(6, ctx.user_id, sender, claimable);
    }

    #[contract_method]
    pub fn batch_transfer_2(&mut self, ctx: &mut ChainContext, recipients: [Felt; 2], amounts: [Felt; 2]) {
        require(ctx.user_id < 16777216, "caller user_id exceeds outbox bounds");
        let total: Felt = 0;
        for i in 0..2 {
            require(amounts[i] <= 18446744069414584320 - total, "total amount overflow");
            total += amounts[i];
        }
        require(self.balance >= total, "insufficient balance for batch transfer");
        for i in 0..2 {
            let recipient = recipients[i];
            let amount = amounts[i];
            if amount > 0 {
                require(recipient != 0 && recipient < 16777216, "recipient user_id exceeds outbox bounds");
                require(recipient != ctx.user_id, "cannot transfer to self");
                let sent = self.other_user_info[recipient].amount_sent;
                require(amount <= 18446744069414584320 - sent, "amount sent overflow");
                self.other_user_info[recipient].amount_sent = sent + amount;
                psystd::emit_event(5, ctx.user_id, recipient, amount);
            }
        }
        self.balance -= total;
    }

    #[contract_method]
    pub fn batch_transfer_5(&mut self, ctx: &mut ChainContext, recipients: [Felt; 5], amounts: [Felt; 5]) {
        require(ctx.user_id < 16777216, "caller user_id exceeds outbox bounds");
        let total: Felt = 0;
        for i in 0..5 {
            require(amounts[i] <= 18446744069414584320 - total, "total amount overflow");
            total += amounts[i];
        }
        require(self.balance >= total, "insufficient balance for batch transfer");
        for i in 0..5 {
            let recipient = recipients[i];
            let amount = amounts[i];
            if amount > 0 {
                require(recipient != 0 && recipient < 16777216, "recipient user_id exceeds outbox bounds");
                require(recipient != ctx.user_id, "cannot transfer to self");
                let sent = self.other_user_info[recipient].amount_sent;
                require(amount <= 18446744069414584320 - sent, "amount sent overflow");
                self.other_user_info[recipient].amount_sent = sent + amount;
                psystd::emit_event(5, ctx.user_id, recipient, amount);
            }
        }
        self.balance -= total;
    }

    #[contract_method]
    pub fn open_delegation_channel(&mut self, ctx: &mut ChainContext, channel_idx: Felt, spender: Felt, amount: Felt) {
        require(channel_idx < 16, "channel index out of bounds");
        require(ctx.user_id != 0 && ctx.user_id < 16777216, "owner user_id exceeds channel bounds");
        require(spender != 0 && spender < 16777216, "spender user_id exceeds channel bounds");
        require(spender != ctx.user_id, "cannot delegate to self");
        require(amount > 0, "amount must be positive");
        require(self.balance >= amount, "insufficient balance to allocate");
        let ch = self.delegations[channel_idx];
        require(ch.status == 0 || ch.status == 3, "channel currently active");
        require(ch.channel_version < 18446744069414584320, "channel version overflow");
        self.balance -= amount;
        self.delegations[channel_idx] = DelegationChannel {
            spender: spender,
            allocated_amount: amount,
            channel_version: ch.channel_version + 1,
            status: 1,
        };
        psystd::emit_event(7, ctx.user_id, channel_idx, spender, amount);
    }

    #[contract_method]
    pub fn spend_delegation(&mut self, ctx: &mut ChainContext, owner: Felt, channel_idx: Felt, amount: Felt, recipient: Felt) {
        require(channel_idx < 16, "channel index out of bounds");
        require(owner != 0 && owner < 16777216, "owner user_id exceeds channel bounds");
        require(ctx.user_id < 16777216, "caller user_id exceeds channel bounds");
        require(recipient != 0 && recipient < 16777216, "recipient user_id exceeds outbox bounds");
        require(recipient != ctx.user_id, "cannot transfer to self");
        require(amount > 0, "amount must be positive");
        let approved_spender = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].spender;
        let allocated = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].allocated_amount;
        let version = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].channel_version;
        let status = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].status;
        require(approved_spender == ctx.user_id, "caller is not channel spender");
        require(status == 1, "channel is not active");
        let ledger_idx = owner * 16 + channel_idx;
        let ledger = self.delegation_spends[ledger_idx];
        require(ledger.channel_version <= version, "historical delegation version cannot be reused");
        let spent: Felt = 0;
        if ledger.channel_version == version {
            require(ledger.closed == 0, "delegation channel was closed by spender");
            spent = ledger.spent;
        } else {
            require(ledger.channel_version == 0 || ledger.closed == 1, "prior delegation version remains open");
        }
        require(spent <= allocated && amount <= allocated - spent, "insufficient delegation allowance");
        let sent = self.other_user_info[recipient].amount_sent;
        require(amount <= 18446744069414584320 - sent, "amount sent overflow");
        self.delegation_spends[ledger_idx] = DelegationSpend {
            spent: spent + amount,
            closed: 0,
            channel_version: version,
        };
        self.other_user_info[recipient].amount_sent = sent + amount;
        psystd::emit_event(8, owner, channel_idx, ctx.user_id, recipient, amount);
    }

    #[contract_method]
    pub fn request_revoke_delegation(&mut self, ctx: &mut ChainContext, channel_idx: Felt) {
        require(channel_idx < 16, "channel index out of bounds");
        let ch = self.delegations[channel_idx];
        require(ch.status == 1, "channel is not active");
        self.delegations[channel_idx] = DelegationChannel {
            spender: ch.spender,
            allocated_amount: ch.allocated_amount,
            channel_version: ch.channel_version,
            status: 2,
        };
        psystd::emit_event(9, ctx.user_id, channel_idx);
    }

    #[contract_method]
    pub fn close_delegation_channel(&mut self, ctx: &mut ChainContext, owner: Felt, channel_idx: Felt, channel_version: Felt) {
        require(owner != 0 && owner < 16777216, "owner user_id exceeds channel bounds");
        require(ctx.user_id < 16777216, "caller user_id exceeds channel bounds");
        require(owner != ctx.user_id, "cannot close delegation to self");
        require(channel_idx < 16, "channel index out of bounds");
        require(channel_version > 0, "channel version must be positive");
        let approved_spender = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].spender;
        let approved_version = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].channel_version;
        let approved_status = ctx.users[owner].contract_state::<Self::ABI>(ctx.contract_id)
            .delegations[channel_idx].status;
        require(approved_spender == ctx.user_id, "caller is not channel spender");
        require(approved_version == channel_version, "channel version does not match owner authorization");
        require(approved_status == 1 || approved_status == 2, "owner channel is not active");
        let ledger_idx = owner * 16 + channel_idx;
        let ledger = self.delegation_spends[ledger_idx];
        require(ledger.channel_version <= channel_version, "historical delegation version cannot be closed again");
        let spent: Felt = 0;
        if ledger.channel_version == channel_version {
            require(ledger.closed == 0, "delegation channel already closed by spender");
            spent = ledger.spent;
        } else {
            require(ledger.channel_version == 0 || ledger.closed == 1, "prior delegation version remains open");
        }
        self.delegation_spends[ledger_idx] = DelegationSpend {
            spent: spent,
            closed: 1,
            channel_version: channel_version,
        };
        psystd::emit_event(10, ctx.user_id, owner, channel_idx, channel_version, spent);
    }

    #[contract_method]
    pub fn finalize_revoke_delegation(&mut self, ctx: &mut ChainContext, channel_idx: Felt, spender: Felt) {
        require(channel_idx < 16, "channel index out of bounds");
        require(spender != 0 && spender < 16777216, "spender user_id exceeds channel bounds");
        require(ctx.user_id < 16777216, "owner user_id exceeds channel bounds");
        let ch = self.delegations[channel_idx];
        require(ch.status == 2, "revoke has not been requested");
        require(ch.spender == spender, "spender does not match channel");
        let ledger_idx = ctx.user_id * 16 + channel_idx;
        let remote_version = ctx.users[spender].contract_state::<Self::ABI>(ctx.contract_id)
            .delegation_spends[ledger_idx].channel_version;
        let remote_closed = ctx.users[spender].contract_state::<Self::ABI>(ctx.contract_id)
            .delegation_spends[ledger_idx].closed;
        let remote_spent = ctx.users[spender].contract_state::<Self::ABI>(ctx.contract_id)
            .delegation_spends[ledger_idx].spent;
        require(remote_version == ch.channel_version, "spender ledger version mismatch");
        require(remote_closed == 1, "spender has not closed delegation channel");
        require(remote_spent <= ch.allocated_amount, "confirmed spent exceeds allocation");
        let refund = ch.allocated_amount - remote_spent;
        require(refund <= 18446744069414584320 - self.balance, "balance overflow");
        self.balance += refund;
        self.delegations[channel_idx] = DelegationChannel {
            spender: 0,
            allocated_amount: 0,
            channel_version: ch.channel_version,
            status: 3,
        };
        psystd::emit_event(11, ctx.user_id, channel_idx, spender, refund);
    }
}
