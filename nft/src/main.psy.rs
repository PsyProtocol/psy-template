#[derive(FeltSized)]
pub struct NFTSlot {
    pub token_id: Hash,
    pub is_active: Felt,
    pub metadata_hash: Hash,
}

#[derive(FeltSized)]
pub struct NFTOutbox {
    pub token_id_0: Hash,
    pub metadata_hash_0: Hash,
    pub token_id_1: Hash,
    pub metadata_hash_1: Hash,
    pub token_id_2: Hash,
    pub metadata_hash_2: Hash,
    pub token_id_3: Hash,
    pub metadata_hash_3: Hash,
    pub nonce_sent: Felt,
    pub nonce_claimed: Felt,
    pub nonce_acked: Felt,
}

const ISSUER_USER_ID: usize = 5;

#[contract]
pub struct PsyNFTContract {
    pub balance: Felt,
    pub mint_authority: Felt,
    pub is_mint_renounced: Felt,
    pub total_minted: Felt,
    pub symbol: Felt,
    pub base_uri_hash: Hash,
    pub owned_tokens: ContractStateArray<128, NFTSlot>,
    pub outbox: ContractStateArray<16777216, NFTOutbox>,
}

#[contract_implementation]
impl PsyNFTContract {
    #[contract_method]
    pub fn set_collection_metadata(&mut self, ctx: &mut ChainContext, symbol: Felt, base_uri_hash: Hash) {
        require(ctx.user_id == ISSUER_USER_ID, "caller is not in canonical ISSUER_USER_ID partition");

        let caller = ctx.user_id;
        require(self.is_mint_renounced == 0, "contract administration has been renounced");
        let auth = self.mint_authority;
        if auth == 0 {
            self.mint_authority = caller;
        } else {
            require(caller == auth, "only mint authority can set collection metadata");
        }
        self.symbol = symbol;
        self.base_uri_hash = base_uri_hash;
        psystd::emit_event(4, symbol, base_uri_hash);
    }

    #[contract_method]
    pub fn mint(&mut self, ctx: &mut ChainContext, slot_idx: Felt, local_id: Felt, metadata_hash: Hash) {
        require(slot_idx < 128, "slot index out of range");
        require(local_id > 0, "local_id must be non-zero");
        require(ctx.user_id == ISSUER_USER_ID, "only designated ISSUER_USER_ID partition can mint");

        let caller = ctx.user_id;
        require(self.is_mint_renounced == 0, "minting has been renounced");
        let auth = self.mint_authority;
        require(auth != 0, "mint authority not initialized");
        require(caller == auth, "only authorized mint authority can mint in deployer partition");

        // Enforce strictly sequential local_id to guarantee unique inputs (creator, local_id) per creator.
        // Preserve all four Poseidon output limbs as the NFT identifier.
        let current_total = self.total_minted;
        require(local_id == current_total + 1, "local_id must match next sequential mint index");
        require(current_total < 18446744069414584320, "total minted overflow");
        self.total_minted = current_total + 1;

        let slot = self.owned_tokens[slot_idx];
        require(slot.is_active == 0, "slot already occupied");

        // Derive token_id via Poseidon hash: Poseidon(creator, local_id)
        let creator_hash: Hash = [caller, 0, 0, 0];
        let local_hash: Hash = [local_id, 0, 0, 0];
        let token_id: Hash = psystd::poseidon_two_to_one(creator_hash, local_hash);
        require(token_id[0] != 0 || token_id[1] != 0 || token_id[2] != 0 || token_id[3] != 0,
            "derived token_id must be non-zero");

        require(self.balance < 18446744069414584320, "balance overflow");
        self.owned_tokens[slot_idx] = NFTSlot {
            token_id: token_id,
            is_active: 1,
            metadata_hash: metadata_hash,
        };
        self.balance += 1;

        psystd::emit_event(1, caller, token_id, metadata_hash);
    }

    #[contract_method]
    pub fn renounce_mint_authority(&mut self, ctx: &mut ChainContext) {
        require(ctx.user_id == ISSUER_USER_ID, "only designated ISSUER_USER_ID partition can renounce mint authority");
        let auth = self.mint_authority;
        require(auth != 0, "mint authority not initialized");
        self.is_mint_renounced = 1;
        self.mint_authority = 0;
        psystd::emit_event(5, 0);
    }

    #[contract_method]
    pub fn transfer(&mut self, ctx: &mut ChainContext, slot_idx: Felt, recipient: Felt) {
        require(slot_idx < 128, "slot index out of range");
        let caller = ctx.user_id;
        require(recipient != 0, "recipient cannot be zero address");
        require(recipient != caller, "cannot transfer to self");
        require(recipient < 16777216, "recipient user_id exceeds outbox bounds");
        require(caller < 16777216, "caller user_id exceeds outbox bounds");
        let slot = self.owned_tokens[slot_idx];
        require(slot.is_active == 1, "no active NFT in slot");
        let token_id = slot.token_id;
        let metadata_hash = slot.metadata_hash;

        // Check FIFO sliding window capacity (max 4 in-flight transfers)
        let prev_nonce_sent = self.outbox[recipient].nonce_sent;
        let prev_nonce_acked = self.outbox[recipient].nonce_acked;
        require(prev_nonce_acked <= prev_nonce_sent, "acknowledged nonce exceeds sent nonce");
        let in_flight = prev_nonce_sent - prev_nonce_acked;
        require(in_flight < 4, "FIFO outbox queue full: recipient has 4 uncollected transfers");

        // Clear local slot with underflow check
        require(self.balance >= 1, "balance underflow");
        let zero_hash: Hash = [0, 0, 0, 0];
        self.owned_tokens[slot_idx] = NFTSlot {
            token_id: zero_hash,
            is_active: 0,
            metadata_hash: zero_hash,
        };
        self.balance -= 1;

        // Put in FIFO circular buffer slot (nonce_sent & 3)
        let queue_slot: Felt = prev_nonce_sent & 3;
        if queue_slot == 0 {
            self.outbox[recipient].token_id_0 = token_id;
            self.outbox[recipient].metadata_hash_0 = metadata_hash;
        } else if queue_slot == 1 {
            self.outbox[recipient].token_id_1 = token_id;
            self.outbox[recipient].metadata_hash_1 = metadata_hash;
        } else if queue_slot == 2 {
            self.outbox[recipient].token_id_2 = token_id;
            self.outbox[recipient].metadata_hash_2 = metadata_hash;
        } else {
            self.outbox[recipient].token_id_3 = token_id;
            self.outbox[recipient].metadata_hash_3 = metadata_hash;
        }
        require(prev_nonce_sent < 18446744069414584320, "nonce_sent overflow");
        self.outbox[recipient].nonce_sent = prev_nonce_sent + 1;

        psystd::emit_event(2, caller, recipient, token_id, metadata_hash);
    }

    #[contract_method]
    pub fn acknowledge(&mut self, ctx: &mut ChainContext, recipient: Felt) {
        let caller = ctx.user_id;
        require(recipient != 0 && recipient != caller, "invalid recipient");
        require(recipient < 16777216 && caller < 16777216, "user_id exceeds outbox bounds");
        let sent = self.outbox[recipient].nonce_sent;
        let old_acked = self.outbox[recipient].nonce_acked;
        let claimed = ctx.users[recipient].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].nonce_claimed;
        require(claimed >= old_acked, "remote claim nonce older than acknowledged nonce");
        require(claimed <= sent, "remote claim nonce exceeds sent nonce");
        self.outbox[recipient].nonce_acked = claimed;
        psystd::emit_event(6, caller, recipient, claimed);
    }

    #[contract_method]
    pub fn claim(&mut self, ctx: &mut ChainContext, slot_idx: Felt, sender: Felt) {
        require(slot_idx < 128, "slot index out of range");
        let caller = ctx.user_id;
        require(sender != 0, "sender cannot be zero address");
        require(sender != caller, "cannot claim from self");
        require(sender < 16777216, "sender user_id exceeds inbox bounds");
        require(caller < 16777216, "caller user_id exceeds inbox bounds");
        let slot = self.owned_tokens[slot_idx];
        require(slot.is_active == 0, "destination slot already occupied");

        let sender_nonce_sent = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].nonce_sent;
        let my_nonce_claimed = self.outbox[sender].nonce_claimed;
        require(sender_nonce_sent > my_nonce_claimed, "no NFT to claim from sender");

        // Next item in FIFO order is at my_nonce_claimed & 3
        let queue_slot: Felt = my_nonce_claimed & 3;
        if queue_slot == 0 {
            let token_id = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].token_id_0;
            let metadata_hash = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].metadata_hash_0;
            require(token_id[0] != 0 || token_id[1] != 0 || token_id[2] != 0 || token_id[3] != 0, "claimed token_id cannot be zero");
            self.owned_tokens[slot_idx] = NFTSlot { token_id: token_id, is_active: 1, metadata_hash: metadata_hash };
            psystd::emit_event(3, caller, sender, token_id, metadata_hash);
        } else if queue_slot == 1 {
            let token_id = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].token_id_1;
            let metadata_hash = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].metadata_hash_1;
            require(token_id[0] != 0 || token_id[1] != 0 || token_id[2] != 0 || token_id[3] != 0, "claimed token_id cannot be zero");
            self.owned_tokens[slot_idx] = NFTSlot { token_id: token_id, is_active: 1, metadata_hash: metadata_hash };
            psystd::emit_event(3, caller, sender, token_id, metadata_hash);
        } else if queue_slot == 2 {
            let token_id = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].token_id_2;
            let metadata_hash = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].metadata_hash_2;
            require(token_id[0] != 0 || token_id[1] != 0 || token_id[2] != 0 || token_id[3] != 0, "claimed token_id cannot be zero");
            self.owned_tokens[slot_idx] = NFTSlot { token_id: token_id, is_active: 1, metadata_hash: metadata_hash };
            psystd::emit_event(3, caller, sender, token_id, metadata_hash);
        } else {
            let token_id = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].token_id_3;
            let metadata_hash = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).outbox[caller].metadata_hash_3;
            require(token_id[0] != 0 || token_id[1] != 0 || token_id[2] != 0 || token_id[3] != 0, "claimed token_id cannot be zero");
            self.owned_tokens[slot_idx] = NFTSlot { token_id: token_id, is_active: 1, metadata_hash: metadata_hash };
            psystd::emit_event(3, caller, sender, token_id, metadata_hash);
        }
        require(self.balance < 18446744069414584320, "balance overflow");
        self.balance += 1;

        require(my_nonce_claimed < 18446744069414584320, "nonce_claimed overflow");
        self.outbox[sender].nonce_claimed = my_nonce_claimed + 1;

    }
}
