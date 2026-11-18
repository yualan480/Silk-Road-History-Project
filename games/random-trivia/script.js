const startButton = document.getElementById("start-btn");
const startParagraph = document.getElementById("start-paragraph");
const nextButton = document.getElementById("next-btn");
const questionContainerElement = document.getElementById("question-container");
const questionElement = document.getElementById("question");
const answerButtonElement = document.getElementById("answer-buttons");
const correctGuessDisplay = document.getElementById("correct-guess");
const wrongGuessDisplay = document.getElementById("wrong-guess");
const endMessage = document.getElementById("end-message");

let currentQuestionIndex,
  correctGuess,
  wrongGuess,
  questions = [];
let selectedAnswerIndex=null,restoringAnswer=false;

// Local questions keep rounds playable without a third-party API.
async function getQuestions(callback) {
  const status = document.getElementById('status');
  if (startButton.disabled) return;
  startButton.disabled = true;
  status.textContent = 'Preparing your questions…';
  try {
    const response = await fetch('questions.json');
    if (!response.ok) throw Error('Question bank unavailable');
    const bank = await response.json();
    if (!Array.isArray(bank) || bank.length < 10) throw Error('Invalid question bank');
    questions = shuffleArray(bank).slice(0, 10).map(q => ({
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      answers: shuffleArray([
        ...q.incorrect_answers.map(text => ({text, correct: false})),
        {text: q.correct_answer, correct: true}
      ])
    }));
    status.textContent = '';
    callback();
  } catch {
    status.textContent = 'Could not load the questions. Press Start to try again.';
  } finally {
    startButton.disabled = false;
  }
}

function readable(text) {
  const element = document.createElement('textarea');
  element.innerHTML = text;
  return element.value;
}

function shuffleArray(array) {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

// Event listener for both start button and next button.
startButton.addEventListener("click", startGame);
nextButton.addEventListener("click", () => {
  currentQuestionIndex++;
  setNextQuestion();
});

// Function for starting the game.
// What it does is to create a random shuffled answers for each question.
// This will remove the 'hide' class off questionContainerElement where our question + answer elements are stored.
function startGame() {
  if (startButton.disabled) return;
  questions = [];
  getQuestions(() => {
    startButton.classList.add("hide");
    startParagraph.classList.add("hide");
    endMessage.classList.add("hide");
    currentQuestionIndex = 0;
    correctGuess = 0;
    wrongGuess = 0;
    questionContainerElement.classList.remove("hide");
    setNextQuestion();
  });
}

// Setting up the next question by calling showQuestion and resetState for resetting the background color back to normal.
function setNextQuestion() {
  selectedAnswerIndex=null;resetState();
  showQuestion(questions[currentQuestionIndex]);saveRound();
}

// This will determine if the question is true or false.
function showQuestion(question) {
  questionElement.textContent = readable(question.question);
  document.getElementById('category').textContent = readable(question.category) + ' · ' + question.difficulty;
  document.getElementById('progress').textContent = 'Question ' + (currentQuestionIndex + 1) + ' of ' + questions.length + ' · Score: ' + correctGuess;
  questionElement.focus({preventScroll:true});
  question.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.textContent = readable(answer.text);
    button.classList.add("btn");
    if (answer.correct) {
      button.dataset.correct = answer.correct;
    }
    button.addEventListener("click", selectAnswer); // Processing the button when clicked.
    answerButtonElement.appendChild(button);
  });
}

// Resetting the state of the body element.
function resetState() {
  document.getElementById('status').textContent = '';
  clearStatusClass(document.body);
  nextButton.classList.add("hide");
  while (answerButtonElement.firstChild) {
    answerButtonElement.removeChild(answerButtonElement.firstChild);
  }
}

// Check if the button clicked is true or false, iterate over the answerButtonElement.children
function selectAnswer(e) {
  const selectedButton = e.currentTarget;
  if (selectedButton.disabled) return;
  selectedAnswerIndex=Array.from(answerButtonElement.children).indexOf(selectedButton);
  const correct = selectedButton.dataset.correct;
  setStatusClass(document.body, correct);

  if(!restoringAnswer){if(correct)correctGuess++;else wrongGuess++;}

  document.getElementById('status').textContent = correct ? 'Correct!' : 'The correct answer is ' + readable(questions[currentQuestionIndex].answers.find(a => a.correct).text) + '.';
  document.getElementById('progress').textContent = 'Question ' + (currentQuestionIndex + 1) + ' of ' + questions.length + ' · Score: ' + correctGuess;
  Array.from(answerButtonElement.children).forEach((button) => {
    setStatusClass(button, button.dataset.correct);
    button.disabled = true;
  });
  if (questions.length > currentQuestionIndex + 1) {
    nextButton.classList.remove("hide");
  } else {
    // Restarting the quizz game if we ran out of questions.
    startButton.innerText = "Restart Trivia";
    startButton.classList.remove("hide");
    endMessage.classList.remove("hide");
    correctGuessDisplay.innerHTML = correctGuess.toString();
    wrongGuessDisplay.innerHTML = wrongGuess.toString();
  }
  saveRound();
}

// Add the class 'correct' if correct or 'wrong' if wrong.
function setStatusClass(element, correct) {
  clearStatusClass(element);
  if (correct) {
    element.classList.add("correct");
  } else {
    element.classList.add("wrong");
  }
}

// Clearing the class after each question.
function clearStatusClass(element) {
  element.classList.remove("correct");
  element.classList.remove("wrong");
}

const TRIVIA_SAVE='orbit-trivia-round-v1';
function saveRound(){if(!questions.length||!Number.isInteger(currentQuestionIndex))return;try{localStorage.setItem(TRIVIA_SAVE,JSON.stringify({version:1,questions,index:currentQuestionIndex,correct:correctGuess,wrong:wrongGuess,selected:selectedAnswerIndex}));}catch{}}
function restoreRound(){try{const data=JSON.parse(localStorage.getItem(TRIVIA_SAVE)||'null');if(data?.version!==1||!Array.isArray(data.questions)||data.questions.length!==10||!Number.isInteger(data.index)||data.index<0||data.index>=10||![data.correct,data.wrong].every(n=>Number.isInteger(n)&&n>=0&&n<=10))return;for(const q of data.questions){if(typeof q.question!=='string'||!Array.isArray(q.answers)||q.answers.length!==4||!q.answers.every(a=>typeof a.text==='string'&&typeof a.correct==='boolean'))return;}questions=data.questions;currentQuestionIndex=data.index;correctGuess=data.correct;wrongGuess=data.wrong;selectedAnswerIndex=data.selected;startButton.classList.add('hide');startParagraph.classList.add('hide');endMessage.classList.add('hide');questionContainerElement.classList.remove('hide');resetState();showQuestion(questions[currentQuestionIndex]);if(Number.isInteger(data.selected)&&data.selected>=0&&data.selected<4){restoringAnswer=true;selectAnswer({currentTarget:answerButtonElement.children[data.selected]});restoringAnswer=false;}}catch{restoringAnswer=false;}}
restoreRound();window.OrbitGameSave?.register(saveRound);addEventListener('pagehide',saveRound);
