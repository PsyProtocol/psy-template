// Fixed-supply companion token for a PSY bonding-curve launch. Replace the two
// zero constants with the registered issuer ID and exact launch inventory
// before compiling a deployment candidate. Never deploy this placeholder.

#[derive(FeltSized)]
pub struct OtherUserInfo {
    pub amount_sent: Felt,
    pub amount_claimed: Felt,
}

const ISSUER_USER_ID: usize = 861696;
const FIXED_SUPPLY: usize = 6000000000;

#[contract]
pub struct PsyLaunchToken {
    pub balance: Felt,
    pub reserved_1: Felt,
    pub reserved_2: Felt,
    pub other_user_info: ContractStateArray<1073741824, OtherUserInfo>,
    pub minted: Felt,
}

#[contract_implementation]
impl PsyLaunchToken {
    #[contract_method]
    pub fn mint_once(&mut self, ctx: &mut ChainContext) {
        require(ISSUER_USER_ID > 0 && ISSUER_USER_ID < 16777216, "issuer not configured");
        require(FIXED_SUPPLY > 0 && FIXED_SUPPLY <= 2000000000000000, "supply not configured");
        require(ctx.user_id == ISSUER_USER_ID, "only launch issuer may mint");
        require(self.minted == 0, "fixed supply already minted");
        self.balance = FIXED_SUPPLY;
        self.minted = 1;
    }

    #[contract_method]
    pub fn transfer(&mut self, ctx: &mut ChainContext, recipient: Felt, amount: Felt) {
        require(recipient > 0 && recipient < 16777216 && recipient != ctx.user_id, "invalid recipient");
        require(amount > 0 && amount <= 2000000000000000, "invalid amount");
        require(self.balance >= amount, "insufficient token balance");
        let sent = self.other_user_info[recipient].amount_sent;
        require(sent <= 2000000000000000 - amount, "outbox total overflow");
        self.balance -= amount;
        self.other_user_info[recipient].amount_sent = sent + amount;
    }

    #[contract_method]
    pub fn claim(&mut self, ctx: &mut ChainContext, sender: Felt) {
        require(sender > 0 && sender < 16777216 && sender != ctx.user_id, "invalid sender");
        let sent = ctx.users[sender].contract_state::<Self::ABI>(ctx.contract_id).other_user_info[ctx.user_id].amount_sent;
        let already_claimed = self.other_user_info[sender].amount_claimed;
        require(sent > already_claimed && sent <= 2000000000000000, "nothing to claim");
        let amount = sent - already_claimed;
        require(self.balance <= 2000000000000000 - amount, "balance overflow");
        self.balance += amount;
        self.other_user_info[sender].amount_claimed = sent;
    }
}
