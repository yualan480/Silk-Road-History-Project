import { Fruit, FruitTypes } from "./fruit.js?v=2";
import { Game } from "./game.js?v=2";
import { Vec2 } from "./vec2.js?v=2";

const score = document.getElementById('score');
const maxScore = document.getElementById('max-score');
const app = document.getElementById('app');
const game = new Game(app).start();

const setScore = ((currentScore) => {
    let maxValue=0;try{maxValue=Math.max(0,Number(localStorage.getItem("orbit-suika-best-v1"))||0);}catch{}
    if (maxValue < currentScore) {
        maxValue = currentScore;
        try{localStorage.setItem("orbit-suika-best-v1",maxValue);}catch{}
    }

    maxScore.textContent = `${maxValue}`.padStart(6, '0');

    score.innerText = `${currentScore}`.padStart(6, '0');
    
})

game.world.onMergeFruits(setScore);

const fruitInfo = document.getElementById('fruit-info');
fruitInfo.width = 100;
fruitInfo.height = 100;

const context = fruitInfo.getContext('2d');

let nextFruit = null;
let currentFruit = null;
const rndNextFruit = (savedType = null) => {
    
    context.fillStyle = '#e9d5b0';
    context.fillRect(0, 0, fruitInfo.width, fruitInfo.height);

    const types = Object.keys(FruitTypes);
    const index = savedType && FruitTypes[savedType] ? types.indexOf(savedType) : Math.floor(Math.random() * 4);
    nextFruit = new Fruit({
        type: FruitTypes[types[index]],
        position: new Vec2(),
    });

    nextFruit.render({
        context,
        radius: 40,
        position: { x: 50, y: 50 }
    });

}

const newGame = () => {
    game.world.clear();
    setScore(0);
    currentFruit = null;
    rndNextFruit();
}

app.addEventListener('click', (e) => {

    if (!nextFruit || currentFruit?.hits === 0) return;

    const rect=app.getBoundingClientRect();
    const x=Math.max(0,Math.min(app.width,(e.clientX-rect.left-app.clientLeft)*(app.width/app.clientWidth)));

    nextFruit.position.set({
        x, y: 0
    });

    if (!game.world.canAdd(nextFruit)) {
        newGame();
    }

    game.world.add(nextFruit);
    currentFruit = nextFruit;
    rndNextFruit();
    saveBoard();

});

const SAVE_KEY='orbit-suika-board-v2';
function saveBoard(){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify({version:2,width:app.width,height:app.height,score:game.world.score||0,next:Object.keys(FruitTypes).find(k=>FruitTypes[k]===nextFruit?.type),current:game.world.fruits.indexOf(currentFruit),fruits:game.world.fruits.map(f=>({type:Object.keys(FruitTypes).find(k=>FruitTypes[k]===f.type),x:f.position.x,y:f.position.y,vx:f.velocity.x,vy:f.velocity.y,angle:f.angle,spin:f.angularVelocity,hits:f.hits}))}));}catch{}
}
function restoreBoard(){
    try{
        const saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
        if(saved?.version!==2||!Array.isArray(saved.fruits)||saved.fruits.length>500||!saved.width||!saved.height)return false;
        if(!Number.isFinite(saved.score)||saved.score<0)return false;
        const restored=saved.fruits.map(f=>{if(!FruitTypes[f.type]||![f.x,f.y,f.vx,f.vy,f.angle,f.spin,f.hits].every(Number.isFinite))throw Error('Invalid fruit');const fruit=new Fruit({type:FruitTypes[f.type],position:new Vec2({x:f.x*app.width/saved.width,y:f.y*app.height/saved.height})});fruit.velocity.set({x:f.vx,y:f.vy});fruit.angle=f.angle;fruit.angularVelocity=f.spin;fruit.hits=f.hits;return fruit;});
        game.world.clear();game.world.fruits=restored;game.world.score=saved.score;currentFruit=restored[saved.current]||null;setScore(saved.score);rndNextFruit(saved.next);return true;
    }catch{return false;}
}
game.clearScreen();if(!restoreBoard())newGame();
setInterval(()=>{if(!document.hidden)saveBoard();},1000);
window.addEventListener('pagehide',saveBoard);
window.OrbitGameSave?.register(saveBoard);



document.getElementById("new-game").addEventListener("click",()=>{newGame();saveBoard();});
document.addEventListener("visibilitychange",()=>{if(document.hidden){saveBoard();game.stop();}else game.start();});
