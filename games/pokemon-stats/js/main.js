import { BattlePokedex } from './Pokedex/pokedex.js';
import { getRandomPokemon, loadPokemonAssets } from "./Pokedex/pokemonUtility.js";
import { setStats } from "./FormControl/bars.js"
import { clear, prepareDocument } from "./DOMControl/basicDOMControl.js"
import { addAutocompleteToSelect } from "./DOMControl/Renderer/autocomplete.js";
import { renderBars } from "./DOMControl/Renderer/BarsRenderer.js";
import Help from "./DOMControl/Renderer/help.js";

let activePokemon=null;
const STATS_SAVE='orbit-pokemon-stats-progress-v1';

if ('complete' === document.readyState) {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main);
}

function main() {
    renderBars();
    prepareDocument();
    let saved;try{saved=JSON.parse(localStorage.getItem(STATS_SAVE)||'null');}catch{}
    if(saved?.version===1&&Array.isArray(saved.tiers))document.querySelectorAll('.tiers-select-area input').forEach(e=>{e.checked=saved.tiers.includes(e.name);});
    loadNewPokemon(saved?.version===1?saved:null);
    addAutocompleteToSelect();
        
    document.querySelectorAll('.reload').forEach(button => button.addEventListener('click', function() {
        loadNewPokemon();
    }));

    Help.addHelpListener();
    if(saved?.version===1){const input=document.querySelector('input#solution');input.value=typeof saved.answer==='string'?saved.answer.slice(0,100):'';if(saved.valuesShown)document.querySelector('.js-show-values').click();for(let i=0;i<Math.min(5,saved.hints||0);i++)document.querySelector('.js-show-help').click();}
    document.addEventListener('input',saveStatsProgress);document.addEventListener('click',()=>setTimeout(saveStatsProgress,0));window.OrbitGameSave?.register(saveStatsProgress);addEventListener('pagehide',saveStatsProgress);
}


function loadNewPokemon(saved=null) {
    clear();

    let pokemon = saved&&BattlePokedex[saved.key]?.num>0?BattlePokedex[saved.key]:getRandomPokemon();activePokemon=pokemon;

    setStats(pokemon);
    loadPokemonAssets(pokemon);
    
    document.querySelector('.solution').innerHTML = pokemon.name;

    Help.setPokemon(pokemon);
    Help.init();if(!saved)saveStatsProgress();
}

function saveStatsProgress(){if(!activePokemon)return;try{localStorage.setItem(STATS_SAVE,JSON.stringify({version:1,key:Object.keys(BattlePokedex).find(k=>BattlePokedex[k]===activePokemon),answer:document.querySelector('input#solution').value,tiers:[...document.querySelectorAll('.tiers-select-area input:checked')].map(e=>e.name),valuesShown:[...document.querySelectorAll('span[class*="-value"]')].some(e=>!e.classList.contains('d-none')),hints:document.querySelectorAll('.help-row:not(.d-none)').length}));}catch{}}
