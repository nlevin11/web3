// main.js
// This file uses ethers.js to connect to MetaMask and interact with the Web3 Joke contract.

import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

// === Contract Setup ===
const contractAddress = "0x3a6922Ec3238c04DA424E6aF1a7E6441A6B8362D"; // Replace with your deployed contract address
const contractABI = [{"type":"event","name":"JokeAdded","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null,"indexed":false}],"anonymous":false},{"type":"event","name":"CorrectGuess","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null,"indexed":false},{"name":"user","type":"address","components":null,"internalType":null,"indexed":false}],"anonymous":false},{"type":"event","name":"IncorrectGuess","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null,"indexed":false},{"name":"user","type":"address","components":null,"internalType":null,"indexed":false},{"name":"attempt","type":"uint256","components":null,"internalType":null,"indexed":false}],"anonymous":false},{"type":"event","name":"PunchlineRevealed","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null,"indexed":false},{"name":"user","type":"address","components":null,"internalType":null,"indexed":false},{"name":"punchline","type":"string","components":null,"internalType":null,"indexed":false}],"anonymous":false},{"type":"constructor","stateMutability":"nonpayable","inputs":[]},{"type":"function","name":"addJoke","stateMutability":"nonpayable","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null},{"name":"punchline","type":"string","components":null,"internalType":null},{"name":"mediaURI","type":"string","components":null,"internalType":null}],"outputs":[]},{"type":"function","name":"guessPunchline","stateMutability":"nonpayable","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null},{"name":"guess","type":"string","components":null,"internalType":null}],"outputs":[]},{"type":"function","name":"revealPunchline","stateMutability":"payable","inputs":[{"name":"jokeId","type":"uint256","components":null,"internalType":null}],"outputs":[{"name":"","type":"string","components":null,"internalType":null}]},{"type":"function","name":"withdraw","stateMutability":"nonpayable","inputs":[],"outputs":[]},{"type":"function","name":"jokes","stateMutability":"view","inputs":[{"name":"arg0","type":"uint256","components":null,"internalType":null}],"outputs":[{"name":"","type":"tuple","components":[{"name":"punchline","type":"string","components":null,"internalType":null},{"name":"punchlineHash","type":"bytes32","components":null,"internalType":null},{"name":"mediaURI","type":"string","components":null,"internalType":null},{"name":"prizePool","type":"uint256","components":null,"internalType":null},{"name":"answered","type":"bool","components":null,"internalType":null}],"internalType":null}]},{"type":"function","name":"guesses","stateMutability":"view","inputs":[{"name":"arg0","type":"uint256","components":null,"internalType":null},{"name":"arg1","type":"address","components":null,"internalType":null}],"outputs":[{"name":"","type":"uint256","components":null,"internalType":null}]},{"type":"function","name":"revealed","stateMutability":"view","inputs":[{"name":"arg0","type":"uint256","components":null,"internalType":null},{"name":"arg1","type":"address","components":null,"internalType":null}],"outputs":[{"name":"","type":"bool","components":null,"internalType":null}]},{"type":"function","name":"owner","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"address","components":null,"internalType":null}]}];

// === Global Variables ===
let provider;
let signer;
let jokeContract;

const MAX_GUESSES = 3; // Free guesses limit
const revealFee = "0.01"; // in ETH, must match the contract's REVEAL_FEE

// --- Video Configurations ---
// For each video, set the associated jokeId, the time (in seconds) when the video should pause,
// and the IPFS source URL.
const videosConfig = [
  {
    jokeId: 1,
    revealTime: 4, // Pause at 10 seconds
    source: "https://dweb.link/ipfs/bafybeibflmvngea2tvk6jlk62fgdlgmwjvsax3wfswloc6lrgeufg6zcrm?filename=video1.mp4"
  },
  {
    jokeId: 2,
    revealTime: 15, // Pause at 15 seconds
    source: "https://dweb.link/ipfs/YOUR_IPFS_VIDEO_HASH_2?filename=video2.mp4"
  },
  {
    jokeId: 3,
    revealTime: 20, // Pause at 20 seconds
    source: "https://dweb.link/ipfs/YOUR_IPFS_VIDEO_HASH_3?filename=video3.mp4"
  }
];

let guessCounts = {}; // Tracks free guess counts per jokeId
let currentVideoIndex = 0; // Index of the currently displayed video

// --- Wallet and Contract Setup ---
async function connectWallet() {
  if (window.ethereum) {
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      jokeContract = new ethers.Contract(contractAddress, contractABI, signer);
      console.log("Wallet connected");
    } catch (err) {
      console.error("User denied wallet access:", err);
    }
  } else {
    alert("Please install MetaMask to use this app");
  }
}

// --- Guess and Reveal Functions ---

// Modified handleGuess: keeps prompting until user guesses correctly or free guesses are exhausted.
// If the user cancels, it directly calls the paid reveal.
async function handleGuess(jokeId) {
  // Initialize guess count if not already set for this jokeId.
  if (guessCounts[jokeId] === undefined) {
    guessCounts[jokeId] = 0;
  }
  
  let isAnswered = false;
  // Continue to prompt while free guesses remain and the joke is not answered.
  while (guessCounts[jokeId] < MAX_GUESSES && !isAnswered) {
    let promptMessage = `Enter your guess for the punchline. You have ${MAX_GUESSES - guessCounts[jokeId]} free guess(es) remaining. Press Cancel to pay and reveal the punchline.`;
    let guess = prompt(promptMessage);
    if (guess === null) {
      // User canceled the prompt; require paid reveal.
      await handleReveal(jokeId);
      return;
    }
    try {
      // Call the contract function with the guess.
      const tx = await jokeContract.guessPunchline(jokeId, guess);
      await tx.wait();
      guessCounts[jokeId]++;
      // Check contract state to see if the joke has been answered.
      const joke = await jokeContract.jokes(jokeId);
      if (joke.answered) {
        alert("Correct guess! The joke has been answered.");
        isAnswered = true;
        return;
      } else {
        alert("Incorrect guess. Please try again.");
      }
    } catch (err) {
      console.error("Error submitting guess:", err);
      return;
    }
  }
  
  // If free guesses are exhausted and the joke is still not answered, require payment.
  if (!isAnswered) {
    alert("You have exhausted your free guesses. Please pay to reveal the punchline.");
    await handleReveal(jokeId);
  }
}

async function handleReveal(jokeId) {
  try {
    const tx = await jokeContract.revealPunchline(jokeId, { value: ethers.utils.parseEther(revealFee) });
    const receipt = await tx.wait();
    let punchline = "";
    receipt.events.forEach((event) => {
      if (event.event === "PunchlineRevealed") {
        punchline = event.args.punchline;
      }
    });
    if (punchline) {
      alert("Punchline revealed: " + punchline);
    } else {
      alert("Punchline revealed.");
    }
    // Resume video playback for the corresponding video element.
    const videoElem = document.getElementById("jokeVideo");
    if (videoElem) {
      videoElem.play();
    }
  } catch (err) {
    console.error("Error revealing punchline:", err);
  }
}

// --- Video Handling Functions ---
// This function attaches an event listener to the single video element.
// When the video's currentTime reaches the configured revealTime, it pauses and prompts for a guess.
function setupVideoListener() {
  const video = document.getElementById("jokeVideo");
  // Remove any previous "timeupdate" listeners by cloning the node.
  const newVideo = video.cloneNode(true);
  video.parentNode.replaceChild(newVideo, video);

  newVideo.addEventListener("timeupdate", async function() {
    const currentConfig = videosConfig[currentVideoIndex];
    if (newVideo.currentTime >= currentConfig.revealTime && !newVideo.paused) {
      newVideo.pause();
      await handleGuess(currentConfig.jokeId);
    }
  });
}

// Update the video element to display the current video's source and reset playback.
function updateVideo() {
  const video = document.getElementById("jokeVideo");
  const currentConfig = videosConfig[currentVideoIndex];
  video.src = currentConfig.source;
  video.load();
  video.currentTime = 0;
  video.play();
  // Reset guess count for the new video.
  guessCounts[currentConfig.jokeId] = 0;
  setupVideoListener();
}

// --- Navigation Button Handlers ---
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

// --- Initialization ---
window.addEventListener("load", async () => {
  await connectWallet();
  setupNavigationButtons();
  updateVideo();
});