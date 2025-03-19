import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

// === Contract Setup ===
const contractAddress = "0x1af6c2193dc3544ffadd1402a16a15f305000020"; // Your deployed address
const contractABI = [
  {"type":"event","name":"CorrectGuess","inputs":[{"name":"jokeId","type":"uint256","indexed":false},{"name":"user","type":"address","indexed":false},{"name":"prize","type":"uint256","indexed":false}],"anonymous":false},
  {"type":"event","name":"IncorrectGuess","inputs":[{"name":"jokeId","type":"uint256","indexed":false},{"name":"user","type":"address","indexed":false},{"name":"attempt","type":"uint256","indexed":false}],"anonymous":false},
  {"type":"event","name":"PunchlineRevealed","inputs":[{"name":"jokeId","type":"uint256","indexed":false},{"name":"user","type":"address","indexed":false},{"name":"punchline","type":"string","indexed":false}],"anonymous":false},
  {"type":"constructor","stateMutability":"nonpayable","inputs":[]},
  {"type":"function","name":"initializeJoke","stateMutability":"nonpayable","inputs":[{"name":"jokeId","type":"uint256"},{"name":"punchline","type":"string"},{"name":"option0","type":"string"},{"name":"option1","type":"string"},{"name":"option2","type":"string"},{"name":"option3","type":"string"},{"name":"mediaURI","type":"string"}],"outputs":[]},
  {"type":"function","name":"updateJoke","stateMutability":"nonpayable","inputs":[{"name":"jokeId","type":"uint256"},{"name":"newPunchline","type":"string"},{"name":"newOption0","type":"string"},{"name":"newOption1","type":"string"},{"name":"newOption2","type":"string"},{"name":"newOption3","type":"string"},{"name":"newMediaURI","type":"string"}],"outputs":[]},
  {"type":"function","name":"guessPunchline","stateMutability":"nonpayable","inputs":[{"name":"jokeId","type":"uint256"},{"name":"optionIndex","type":"uint256"}],"outputs":[]},
  {"type":"function","name":"revealPunchline","stateMutability":"payable","inputs":[{"name":"jokeId","type":"uint256"}],"outputs":[{"name":"","type":"string"}]},
  {"type":"function","name":"withdraw","stateMutability":"nonpayable","inputs":[],"outputs":[]},
  {"type":"function","name":"jokes","stateMutability":"view","inputs":[{"name":"arg0","type":"uint256"}],"outputs":[{"name":"","type":"tuple","components":[{"name":"punchline","type":"string"},{"name":"punchlineHash","type":"bytes32"},{"name":"optionHashes","type":"bytes32[4]"},{"name":"mediaURI","type":"string"},{"name":"prizePool","type":"uint256"},{"name":"answered","type":"bool"},{"name":"winner","type":"address"}]}]},
  {"type":"function","name":"guesses","stateMutability":"view","inputs":[{"name":"arg0","type":"uint256"},{"name":"arg1","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"revealed","stateMutability":"view","inputs":[{"name":"arg0","type":"uint256"},{"name":"arg1","type":"address"}],"outputs":[{"name":"","type":"bool"}]},
  {"type":"function","name":"owner","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"address"}]}
];

let provider;
let signer;
let jokeContract;

const MAX_GUESSES = 2;
const REVEAL_FEE = "0.01"; // in ETH

// --- Video Configurations ---
const videosConfig = [
  {
    jokeId: 1,
    revealTime: 36, // seconds at which to pause and prompt
    source: "https://dweb.link/ipfs/bafybeig5ij2seagzl75reejm5f6dkj4w2dowjy7asw55wuduek56rhesdu?filename=video1.mp4",
    options: [
      "All of the speeders are set free",
      "The judge doesn't care and upholds her ticket",
      "Lebron James shows up and pays the ticket",
      "Lebron James saves the day"
    ]
  },
  {
    jokeId: 2,
    revealTime: 4,
    source: "https://dweb.link/ipfs/bafybeibflmvngea2tvk6jlk62fgdlgmwjvsax3wfswloc6lrgeufg6zcrm?filename=video1.mp4",
    options: [
      "He lands and survives",
      "He lands and dies",
      "He starts flying",
      "He pops a parachute"
    ]
  }
];

let currentVideoIndex = 0;
// A flag to indicate if the current joke has been answered or skipped.
let jokeAnswered = false;
// Timeout variable to auto-resume video if no option is clicked.
let optionsTimeout;

// --- Loading Indicator Functions ---
function showLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "flex";
}

function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}

// --- Utility: Check if Joke Is Initialized ---
async function isJokeInitialized(jokeId) {
  if (!jokeContract) {
    alert("Wallet not connected. Please refresh after connecting your wallet.");
    return false;
  }
  try {
    const joke = await jokeContract.jokes(jokeId);
    if (joke.punchlineHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error checking joke initialization:", err);
    return false;
  }
}

// --- Utility: Continue Video Playback ---
function continueVideoPlayback() {
  jokeAnswered = true; // prevent further pauses
  document.getElementById("optionsContainer").style.display = "none";
  const video = document.getElementById("jokeVideo");
  setTimeout(() => {
    video.play().catch(console.error);
  }, 50);
}

// --- Utility: Display Skip Button After Error ---
function displaySkipButton() {
  const optionsDiv = document.getElementById("options");
  // If a skip button already exists, do nothing.
  if (document.getElementById("skipButton")) return;
  const skipButton = document.createElement("button");
  skipButton.id = "skipButton";
  skipButton.textContent = "Skip and Continue Video";
  skipButton.addEventListener("click", () => {
    continueVideoPlayback();
    skipButton.remove();
  });
  optionsDiv.appendChild(skipButton);
}

// --- Wallet and Contract Setup ---
async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install MetaMask to use this app");
    return;
  }
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();
    const expectedChainId = 11155111; // Sepolia chain id
    if (network.chainId !== expectedChainId) {
      alert(`Please switch MetaMask to Sepolia (chain ID ${expectedChainId})`);
      return;
    }
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    const userAddress = await signer.getAddress();
    jokeContract = new ethers.Contract(contractAddress, contractABI, signer);
    console.log("Connected address:", userAddress);
  } catch (err) {
    console.error("Wallet connection failed:", err);
    alert("Failed to connect wallet: " + err.message);
  }
}

// --- Timeupdate Handler ---
async function timeUpdateHandler(event) {
  const video = event.target;
  if (jokeAnswered) {
    video.removeEventListener("timeupdate", timeUpdateHandler);
    return;
  }
  const config = videosConfig[currentVideoIndex];
  if (video.currentTime >= config.revealTime && !video.paused) {
    video.pause();
    await displayOptions(config.jokeId);
  }
}

// --- Setup Video Listener ---
function setupVideoListener() {
  const video = document.getElementById("jokeVideo");
  video.removeEventListener("timeupdate", timeUpdateHandler);
  video.addEventListener("timeupdate", timeUpdateHandler);
  video.onerror = function() {
    console.error("Video error:", video.error);
    alert("Error loading video. Please try refreshing the page.");
  };
}

// --- Video Update ---
function updateVideo() {
  const video = document.getElementById("jokeVideo");
  const config = videosConfig[currentVideoIndex];
  video.src = config.source;
  video.load();
  video.currentTime = 0;
  jokeAnswered = false;
  document.getElementById("optionsContainer").style.display = "none";
  if (optionsTimeout) clearTimeout(optionsTimeout);
  setupVideoListener();
  video.play().catch(console.error);
}

// --- Guess and Reveal Functions ---
async function handleGuess(jokeId, optionIndex) {
  if (!jokeContract) {
    alert("Wallet not connected. Please refresh after connecting your wallet.");
    continueVideoPlayback();
    return;
  }
  if (!(await isJokeInitialized(jokeId))) {
    alert("This joke has not been initialized yet.");
    continueVideoPlayback();
    return;
  }
  try {
    showLoading();
    const userAddress = await signer.getAddress();
    const guessCount = Number(await jokeContract.guesses(jokeId, userAddress));
    if (guessCount >= MAX_GUESSES) {
      hideLoading();
      if (confirm("No free guesses left. Pay 0.01 ETH to reveal the punchline?")) {
        await handleReveal(jokeId);
      } else {
        displaySkipButton();
      }
      return;
    }
    const tx = await jokeContract.guessPunchline(jokeId, optionIndex, { gasLimit: 300000 });
    await tx.wait();
    hideLoading();
    const joke = await jokeContract.jokes(jokeId);
    if (joke.answered) {
      alert("Correct! The joke has been answered.");
      jokeAnswered = true;
      document.getElementById("optionsContainer").style.display = "none";
      // Remove timeupdate listener so it won't pause again.
      document.getElementById("jokeVideo").removeEventListener("timeupdate", timeUpdateHandler);
      continueVideoPlayback();
    } else {
      alert("Incorrect guess. Try again!");
      continueVideoPlayback();
    }
  } catch (err) {
    hideLoading();
    console.error("Guess error:", err);
    alert("Error submitting guess: " + (err.message || "Unknown error") + "\nYou can skip to continue.");
    displaySkipButton();
  }
}

async function handleReveal(jokeId) {
  if (!jokeContract) {
    alert("Wallet not connected. Please refresh after connecting your wallet.");
    continueVideoPlayback();
    return;
  }
  try {
    const userAddress = await signer.getAddress();
    const guessCount = Number(await jokeContract.guesses(jokeId, userAddress));
    if (guessCount < MAX_GUESSES) {
      alert("You still have free guesses available. Use them before paying to reveal.");
      continueVideoPlayback();
      return;
    }
    showLoading();
    const overrides = { value: ethers.utils.parseEther(REVEAL_FEE), gasLimit: 400000 };
    const tx = await jokeContract.revealPunchline(jokeId, overrides);
    const receipt = await tx.wait();
    hideLoading();
    const punchlineEvent = receipt.events.find(e => e.event === "PunchlineRevealed");
    const punchline = punchlineEvent ? punchlineEvent.args.punchline : "Revealed";
    alert(`Punchline: ${punchline}`);
    jokeAnswered = true;
    document.getElementById("optionsContainer").style.display = "none";
    document.getElementById("jokeVideo").removeEventListener("timeupdate", timeUpdateHandler);
    continueVideoPlayback();
  } catch (err) {
    hideLoading();
    console.error("Reveal error:", err);
    alert("Error revealing punchline: " + (err.message || "Unknown error") + "\nYou can skip to continue.");
    displaySkipButton();
  }
}

// --- Display Options ---
async function displayOptions(jokeId) {
  try {
    if (!(await isJokeInitialized(jokeId))) {
      alert("This joke has not been initialized yet.");
      continueVideoPlayback();
      return;
    }
    
    const config = videosConfig.find(v => v.jokeId === jokeId);
    const optionsContainer = document.getElementById("optionsContainer");
    const optionsDiv = document.getElementById("options");
    
    optionsContainer.style.display = "block";
    optionsDiv.innerHTML = "";
    
    config.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.textContent = option;
      button.addEventListener("click", async () => {
        clearTimeout(optionsTimeout);
        await handleGuess(jokeId, index);
      });
      optionsDiv.appendChild(button);
    });
    
    const revealButton = document.createElement("button");
    revealButton.textContent = "Reveal Punchline (0.01 ETH)";
    revealButton.addEventListener("click", async () => {
      clearTimeout(optionsTimeout);
      await handleReveal(jokeId);
    });
    optionsDiv.appendChild(revealButton);
    
    // No skip button added here; it will be added only if a transaction fails.
    
    // Auto-resume playback if no option is selected within 10 seconds.
    optionsTimeout = setTimeout(() => {
      continueVideoPlayback();
    }, 10000);
  } catch (err) {
    console.error("Error displaying options:", err);
    continueVideoPlayback();
  }
}

// --- Navigation ---
function setupNavigationButtons() {
  const prevButton = document.getElementById("prevButton");
  const nextButton = document.getElementById("nextButton");
  prevButton.addEventListener("click", () => {
    if (currentVideoIndex > 0) {
      currentVideoIndex--;
      updateVideo();
    }
  });
  nextButton.addEventListener("click", () => {
    if (currentVideoIndex < videosConfig.length - 1) {
      currentVideoIndex++;
      updateVideo();
    }
  });
}

// --- Admin: Initialize Joke ---
async function addJoke() {
  if (!jokeContract) {
    alert("Wallet not connected. Please refresh after connecting your wallet.");
    return;
  }
  
  const jokeId = document.getElementById("jokeId").value;
  const punchline = document.getElementById("punchline").value;
  const mediaURI = document.getElementById("mediaURI").value;
  const option0 = document.getElementById("option0").value;
  const option1 = document.getElementById("option1").value;
  const option2 = document.getElementById("option2").value;
  const option3 = document.getElementById("option3").value;
  
  if (!option0 || !option1 || !option2 || !option3) {
    alert("Please enter all 4 options.");
    return;
  }
  
  try {
    showLoading();
    const tx = await jokeContract.initializeJoke(
      jokeId, punchline, option0, option1, option2, option3, mediaURI,
      { gasLimit: 500000 }
    );
    await tx.wait();
    hideLoading();
    alert("Joke initialized successfully!");
  } catch (err) {
    hideLoading();
    console.error("Error initializing joke:", err);
    alert("Error initializing joke. Check console for details.");
  }
}

function setupAddJokeForm() {
  const addJokeForm = document.getElementById("addJokeForm");
  addJokeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addJoke();
  });
}

// --- MetaMask Event Listeners ---
function setupMetaMaskListeners() {
  if (window.ethereum) {
    window.ethereum.on('chainChanged', () => {
      console.log('MetaMask chain changed. Reloading...');
      window.location.reload();
    });
    window.ethereum.on('accountsChanged', () => {
      console.log('MetaMask account changed. Reloading...');
      window.location.reload();
    });
  }
}

// --- Initialization ---
window.addEventListener("load", async () => {
  setupMetaMaskListeners();
  // Automatically prompt wallet connection on page load.
  await connectWallet();
  setupNavigationButtons();
  updateVideo();
  setupAddJokeForm();
});