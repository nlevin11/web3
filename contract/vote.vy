# @version 0.3.7

# Constants
REVEAL_FEE: constant(uint256) = 10**16  # 0.01 ETH (or testnet equivalent)
MAX_GUESSES: constant(uint256) = 3      # Maximum free guesses per user per joke

# Joke structure with hashed options instead of string arrays
struct Joke:
    punchline: String[128]       # The correct punchline text (for reveal only)
    punchlineHash: bytes32       # keccak256 hash of the punchline
    optionHashes: bytes32[4]     # Hashes of the 4 multiple-choice options
    mediaURI: String[256]        # IPFS hash or URL for the video
    prizePool: uint256           # Accumulated funds from reveal fees
    answered: bool               # True if someone guessed correctly
    winner: address              # Address of the winner

# Mappings
jokes: public(HashMap[uint256, Joke])
guesses: public(HashMap[uint256, HashMap[address, uint256]])
revealed: public(HashMap[uint256, HashMap[address, bool]])

# Contract owner
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

# ------------------- Initialization -------------------

@external
def initializeJoke(jokeId: uint256, punchline: String[128], optionHashes: bytes32[4], mediaURI: String[256]):
    """
    Initializes a joke with pre-hashed options.
    - punchline: The correct punchline (stored for reveal).
    - optionHashes: keccak256 hashes of the 4 options, where one matches punchlineHash.
    """
    assert msg.sender == self.owner, "Only owner can initialize"
    assert self.jokes[jokeId].punchlineHash == empty(bytes32), "Joke already exists"
    punchline_hash: bytes32 = keccak256(convert(punchline, Bytes[128]))
    self.jokes[jokeId] = Joke({
        punchline: punchline,
        punchlineHash: punchline_hash,
        optionHashes: optionHashes,
        mediaURI: mediaURI,
        prizePool: 0,
        answered: False,
        winner: empty(address)
    })

# ------------------- User Functions -------------------

@external
def guessPunchline(jokeId: uint256, optionIndex: uint256):
    """
    Guess the punchline by selecting an option index (0-3).
    The selected option's hash is compared to the punchlineHash.
    """
    joke: Joke = self.jokes[jokeId]
    assert joke.punchlineHash != empty(bytes32), "Joke does not exist"
    assert not joke.answered, "Joke already answered"
    assert optionIndex < 4, "Invalid option index; must be 0-3"
    
    user_attempts: uint256 = self.guesses[jokeId][msg.sender]
    assert user_attempts < MAX_GUESSES, "No guesses remaining; please pay to reveal"
    
    self.guesses[jokeId][msg.sender] = user_attempts + 1
    
    selected_option_hash: bytes32 = joke.optionHashes[optionIndex]
    
    if selected_option_hash == joke.punchlineHash:
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
    Pay to reveal the punchline after exhausting free guesses.
    """
    joke: Joke = self.jokes[jokeId]
    assert joke.punchlineHash != empty(bytes32), "Joke does not exist"
    assert self.guesses[jokeId][msg.sender] >= MAX_GUESSES, "Guesses remaining; cannot reveal yet"
    assert not self.revealed[jokeId][msg.sender], "Punchline already revealed"
    assert msg.value == REVEAL_FEE, "Incorrect reveal fee; must be 0.01 ETH"
    
    self.jokes[jokeId].prizePool += msg.value
    self.revealed[jokeId][msg.sender] = True
    log PunchlineRevealed(jokeId, msg.sender, joke.punchline)
    return joke.punchline

# ------------------- View Functions -------------------

@external
@view
def getOptionHash(jokeId: uint256, index: uint256) -> bytes32:
    """
    Returns the hash of a single option for a given joke by index (0-3).
    """
    assert index < 4, "Index out of bounds"
    joke: Joke = self.jokes[jokeId]
    assert joke.punchlineHash != empty(bytes32), "Joke does not exist"
    return joke.optionHashes[index]

# ------------------- Withdrawal -------------------

@external
def withdraw():
    assert msg.sender == self.owner, "Only owner can withdraw"
    send(self.owner, self.balance)