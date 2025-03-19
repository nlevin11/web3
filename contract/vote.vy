# @version 0.3.7

# Constants
REVEAL_FEE: constant(uint256) = 10**16  # 0.01 ETH (in wei)
MAX_GUESSES: constant(uint256) = 3      # Maximum free guesses per user per joke

# Joke structure
struct Joke:
    punchline: String[128]       # The correct punchline (revealed only)
    punchlineHash: bytes32       # keccak256 hash of the punchline
    optionHashes: bytes32[4]     # keccak256 hashes of the 4 multiple-choice options
    mediaURI: String[256]        # IPFS hash or URL for the video
    prizePool: uint256           # Accumulated funds from reveal fees
    answered: bool               # True if someone guessed correctly
    winner: address              # Address of the winner (if answered)

# Mappings to store jokes and track user interactions
jokes: public(HashMap[uint256, Joke])
guesses: public(HashMap[uint256, HashMap[address, uint256]])
revealed: public(HashMap[uint256, HashMap[address, bool]])

# Owner of the contract
owner: public(address)

# ------------------- Events -------------------

event CorrectGuess:
    jokeId: uint256
    user: address
    prize: uint256

event IncorrectGuess:
    jokeId: uint256
    user: address
    attempt: uint256

event PunchlineRevealed:
    jokeId: uint256
    user: address
    punchline: String[128]

# ------------------- Constructor -------------------

@external
def __init__():
    self.owner = msg.sender

# ------------------- Admin Function -------------------
@external
def initializeJoke(
    jokeId: uint256, 
    punchline: String[128], 
    option0: String[64],
    option1: String[64],
    option2: String[64],
    option3: String[64],
    mediaURI: String[256]
):
    """
    Initializes a new joke.
    - Only the owner may call this function.
    - The function computes the keccak256 hash of the punchline and each option.
    - The plain text options are provided by the admin.
    """
    # Only owner can initialize a joke
    assert msg.sender == self.owner, "Only owner can initialize a joke"
    # Ensure the joke hasn't been initialized yet
    assert self.jokes[jokeId].punchlineHash == empty(bytes32), "Joke already exists"
    
    # Compute hashes (ensure the string sizes are within the specified limits)
    punchline_hash: bytes32 = keccak256(convert(punchline, Bytes[128]))
    option0_hash: bytes32 = keccak256(convert(option0, Bytes[64]))
    option1_hash: bytes32 = keccak256(convert(option1, Bytes[64]))
    option2_hash: bytes32 = keccak256(convert(option2, Bytes[64]))
    option3_hash: bytes32 = keccak256(convert(option3, Bytes[64]))
    
    self.jokes[jokeId] = Joke({
        punchline: punchline,
        punchlineHash: punchline_hash,
        optionHashes: [option0_hash, option1_hash, option2_hash, option3_hash],
        mediaURI: mediaURI,
        prizePool: 0,
        answered: False,
        winner: empty(address)
    })

@external
def updateJoke(
    jokeId: uint256, 
    newPunchline: String[128],
    newOption0: String[64],
    newOption1: String[64],
    newOption2: String[64],
    newOption3: String[64],
    newMediaURI: String[256]
):
    """
    Updates an already initialized joke.
    Only the owner can call this function.
    """
    # Only owner can update a joke
    assert msg.sender == self.owner, "Only owner can update the joke"
    # Ensure the joke exists
    assert self.jokes[jokeId].punchlineHash != empty(bytes32), "Joke not initialized"
    
    newPunchlineHash: bytes32 = keccak256(convert(newPunchline, Bytes[128]))
    newOption0Hash: bytes32 = keccak256(convert(newOption0, Bytes[64]))
    newOption1Hash: bytes32 = keccak256(convert(newOption1, Bytes[64]))
    newOption2Hash: bytes32 = keccak256(convert(newOption2, Bytes[64]))
    newOption3Hash: bytes32 = keccak256(convert(newOption3, Bytes[64]))
    
    # Update the joke with new values.
    self.jokes[jokeId] = Joke({
        punchline: newPunchline,
        punchlineHash: newPunchlineHash,
        optionHashes: [newOption0Hash, newOption1Hash, newOption2Hash, newOption3Hash],
        mediaURI: newMediaURI,
        prizePool: self.jokes[jokeId].prizePool,  # preserving any accumulated prize, or you can reset it
        answered: False,
        winner: empty(address)
    })

# ------------------- User Functions -------------------
@external
def guessPunchline(jokeId: uint256, optionIndex: uint256):
    """
    Submit a guess for the punchline by choosing an option index (0-3).
    - The function increments the free guess counter for the caller.
    - If the hash of the chosen option matches the punchline hash, the joke is marked as answered.
    """
    joke: Joke = self.jokes[jokeId]
    # Check that the joke exists
    assert joke.punchlineHash != empty(bytes32), "Joke does not exist"
    # Ensure the joke has not been answered already
    assert not joke.answered, "Joke already answered"
    # Validate the option index
    assert optionIndex < 4, "Invalid option index; must be 0-3"
    
    # Check free guess count for the caller
    user_attempts: uint256 = self.guesses[jokeId][msg.sender]
    assert user_attempts < MAX_GUESSES, "No free guesses remaining; please reveal the punchline"
    
    # Increment the guess count
    self.guesses[jokeId][msg.sender] = user_attempts + 1
    
    # Compare the hash of the selected option with the punchline hash
    if joke.optionHashes[optionIndex] == joke.punchlineHash:
        # Correct guess: mark the joke as answered and record the winner
        self.jokes[jokeId].answered = True
        self.jokes[jokeId].winner = msg.sender
        prize: uint256 = joke.prizePool
        self.jokes[jokeId].prizePool = 0
        if prize > 0:
            send(msg.sender, prize)
        log CorrectGuess(jokeId, msg.sender, prize)
    else:
        log IncorrectGuess(jokeId, msg.sender, user_attempts + 1)

@external
@payable
def revealPunchline(jokeId: uint256) -> String[128]:
    """
    Reveal the punchline after free guesses are exhausted by paying exactly REVEAL_FEE.
    - The caller must have used at least MAX_GUESSES free attempts.
    - The function adds the ETH to the prize pool and returns the punchline.
    """
    joke: Joke = self.jokes[jokeId]
    # Check that the joke exists
    assert joke.punchlineHash != empty(bytes32), "Joke does not exist"
    # Verify that the caller has exhausted their free guesses
    user_attempts: uint256 = self.guesses[jokeId][msg.sender]
    assert user_attempts >= MAX_GUESSES, "Free guesses still available"
    # Ensure the caller hasn't already revealed the punchline
    assert not self.revealed[jokeId][msg.sender], "Punchline already revealed"
    # Ensure the exact reveal fee is sent
    assert msg.value == REVEAL_FEE, "Incorrect reveal fee; must be 0.01 ETH"
    
    self.jokes[jokeId].prizePool += msg.value
    self.revealed[jokeId][msg.sender] = True
    log PunchlineRevealed(jokeId, msg.sender, joke.punchline)
    return joke.punchline

# ------------------- Withdrawal -------------------
@external
def withdraw():
    """
    Withdraw all accumulated funds from the contract.
    Only the owner can withdraw.
    """
    assert msg.sender == self.owner, "Only owner can withdraw"
    send(self.owner, self.balance)