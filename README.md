# Daemons - Backend

This folder contains Solidity contracts, relative tests and mocks and some scripts to easily deploy onto the blockchain.

## Verification codes

Each failed condition corresponds to a code. Here is the complete list:

### Final Codes (scripts cannot be executed anymore)

- [SIGNATURE][FINAL]: The signature does not match with the script content.
- [REVOKED][FINAL]: the script owner revoked it.
- [REPETITIONS_CONDITION][FINAL]: the script has reached the max number of repetitions.

### Temporary Codes (the script cannot be executed right now)

- [FOLLOW_CONDITION][TMP]: this script is bound to another script that hasn't been executed yet.
- [FREQUENCY_CONDITION][TMP]: not enough time has passed for this script to be executed.
- [BALANCE_CONDITION_LOW][TMP]: the user has not enough tokens in the wallet and the balance condition cannot be triggered.
- [BALANCE_CONDITION_HIGH][TMP]: the user has too many tokens in the wallet and the balance condition cannot be triggered.
- [PRICE_CONDITION_LOW][TMP]: the token price is below the one set in the price condition.
- [PRICE_CONDITION_HIGH][TMP]: the token price is above the one set in the price condition.
- [SCRIPT_BALANCE][TMP]: the minimum balance needed for the script to run is not reached.
- [GAS][TMP]: the user doesn't have enough gas in the gas tank to execute the scripts.
- [HEALTH_FACTOR_LOW][TMP]: Health Factor lower than threshold
- [HEALTH_FACTOR_HIGH][TMP]: Health Factor higher than threshold

### Action Codes (the script cannot be executed until the user takes an action)

- [ALLOWANCE][ACTION]: the user needs to give allowance to the executor contract to move some tokens

### Error Codes (the script is in an impossible situation. An email should be sent to the admins to inform about it)

- [CHAIN][ERROR]: the script is trying to be executed in the wrong chain.

### Action dependant codes

- [BORROW_TOO_HIGH][FINAL]: the script is set to borrowing a percentage that is too high and would put the user at risk.
- [BORROW_TOO_HIGH][TMP]: the script is trying to borrow an amount that would put the user at risk now, but would be alright in another moment.
- [NO_DEBT][TMP]: the script is to repay a debt that does not exist (yet/anymore)
