// Main app logic (migrated from inline script). Uses supabase helpers in ./firebase.js
import {
    loginUser,
    signupUser,
    logoutUser,
    savePlanToSupabase,
    loadPlanFromSupabase,
    onAuthChanged,
    prepareConfig
} from './firebase.js';

let currentPlan = [];
let draftPlan = [];
let activeEditor = 'creator'; // 'creator' when editing in Kreator, 'saved' when viewing saved plan
let planConfig = { mixEnabled: false };
let currentUser = null;

// show/hide helpers
function showAuthSection(show) {
    const auth = document.getElementById('auth-section');
    if (!auth) return;
    auth.style.display = show ? '' : 'none';
}
function showAppRoot(show) {
    const app = document.querySelector('.app');
    if (!app) return;
    app.style.display = show ? 'flex' : 'none';
}
function showLogout(show) {
    const wrap = document.getElementById('logout-wrap');
    if (!wrap) return;
    wrap.style.display = show ? '' : 'none';
}

async function savePlan() {
    const toast = document.getElementById('toast');
    try {
        if (currentUser && currentUser.user_metadata && currentUser.user_metadata.username) {
            const username = currentUser.user_metadata.username;
            const payload = { plan: currentPlan, config: planConfig };
            await savePlanToSupabase(username, payload);
            if (toast) { toast.style.display = 'block'; setTimeout(() => { toast.style.display = 'none'; }, 1000); }
            renderSavedPlan();
        } else {
            console.warn('No currentUser - plan not saved to Supabase.');
        }
    } catch (err) {
        console.error('savePlan failed', err);
    }
}

// Auth listeners and UI wiring
function initAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    
    if (loginBtn) loginBtn.addEventListener('click', async () => {
        try {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            if (!username || !password) {
                alert('Podaj nazwę użytkownika i hasło');
                return;
            }
            if (username.length < 4) {
                alert('Nazwa użytkownika musi mieć co najmniej 4 znaki');
                return;
            }
            if (password.length < 4) {
                alert('Hasło musi mieć co najmniej 4 znaki');
                return;
            }
            await loginUser(username, password);
        } catch (e) {
            console.error('loginUser failed', e);
            const msg = (e && e.message) ? e.message : String(e);
            alert('Logowanie nie powiodło się: ' + msg);
        }
    });
    
    if (signupBtn) signupBtn.addEventListener('click', async () => {
        try {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            if (!username || !password) {
                alert('Podaj nazwę użytkownika i hasło');
                return;
            }
            if (username.length < 4) {
                alert('Nazwa użytkownika musi mieć co najmniej 4 znaki');
                return;
            }
            if (password.length < 4) {
                alert('Hasło musi mieć co najmniej 4 znaki');
                return;
            }
            await signupUser(username, password);
            alert('Konto utworzone! Możesz się teraz zalogować.');
        } catch (e) {
            console.error('signupUser failed', e);
            const msg = (e && e.message) ? e.message : String(e);
            alert('Tworzenie konta nie powiodło się: ' + msg);
        }
    });
    
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
        try {
            await logoutUser();
        } catch (e) {
            console.error('logoutUser failed', e);
            const msg = (e && e.message) ? e.message : String(e);
            alert('Wylogowanie nie powiodło się: ' + msg);
        }
    });

    // subscribe to auth state changes
    onAuthChanged(async (user) => {
        if (user) {
            currentUser = user;
            const username = user.user_metadata?.username || 'unknown';
            showAuthSection(false);
            showAppRoot(true);
            showLogout(true);
            
            // Update username display
            const usernameDisplay = document.getElementById('username-display');
            if (usernameDisplay) usernameDisplay.textContent = username;
            
            // load plan from Supabase
            try {
                const data = await loadPlanFromSupabase(username);
                if (data && data.plan) {
                    currentPlan = data.plan || [];
                    planConfig = data.config || planConfig;
                    currentPlan.forEach(d => { if (typeof d.selectedSetIndex === 'undefined') d.selectedSetIndex = -1; });
                } else {
                    currentPlan = [];
                }
            } catch (e) {
                console.error('Failed to load plan from Supabase', e);
                currentPlan = [];
            }
            draftPlan = [];
            activeEditor = 'creator';
            renderCreator();
            renderSavedPlan();
            // switch to saved tab when signed in
            const savedTab = document.getElementById('tab-saved'); if (savedTab) savedTab.click();
        } else {
            currentUser = null;
            // hide app and show auth
            showAuthSection(true);
            showAppRoot(false);
            showLogout(false);
            // clear in-memory plan to avoid accidental viewing
            currentPlan = [];
            draftPlan = [];
            renderCreator();
            renderSavedPlan();
        }
    });
}

// Wire up UI handlers and existing app logic
function initAppLogic() {
    // tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.content section').forEach(s => s.style.display = (s.getAttribute('data-tab') === tab) ? '' : 'none');
        });
    });

    // bind apply-days and create-plan
    const applyBtn = document.getElementById('apply-days-btn');
    const createBtn = document.getElementById('create-plan-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const daysInput = document.getElementById('days-input');
            const days = parseInt(daysInput.value, 10);
            if (!Number.isInteger(days) || days < 1 || days > 7) { alert('Wprowadź liczbę dni od 1 do 7.'); return; }
            draftPlan = [];
            for (let i = 1; i <= days; i++) draftPlan.push({ day: i, exercises: [], selectedSetIndex: -1 });
            activeEditor = 'creator';
            renderCreator();
        });
    }
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            if (!Array.isArray(draftPlan) || draftPlan.length === 0) { alert('Najpierw ustaw liczbę dni i dodaj ćwiczenia (Użyj "Zastosuj dni").'); return; }
            currentPlan = JSON.parse(JSON.stringify(draftPlan));
            currentPlan.forEach(d => { if (typeof d.selectedSetIndex === 'undefined') d.selectedSetIndex = -1; });
            // persist
            savePlan();
            renderSavedPlan();
            const savedTab = document.getElementById('tab-saved');
            if (savedTab) savedTab.click();
        });
    }

    // default to create tab
    const createTab = document.getElementById('tab-create'); if (createTab) createTab.click();

    // delegated click handler
    document.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.tab-button');
        if (tabBtn) {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            const tab = tabBtn.getAttribute('data-tab');
            if (tab === 'create') activeEditor = 'creator';
            else if (tab === 'saved') activeEditor = 'saved';
            document.querySelectorAll('.content section').forEach(s => s.style.display = (s.getAttribute('data-tab') === tab) ? '' : 'none');
            return;
        }
        const addBtn = e.target.closest('.add-exercise-btn');
        if (addBtn) {
            const dayDiv = addBtn.closest('.day-block');
            const dayIndex = dayDiv ? parseInt(dayDiv.getAttribute('data-day-index'), 10) : 0;
            openExerciseForm({ mode: 'add', dayIndex: isNaN(dayIndex) ? 0 : dayIndex });
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const dayDiv = editBtn.closest('.day-block');
            const dayIndex = dayDiv ? parseInt(dayDiv.getAttribute('data-day-index'), 10) : 0;
            const title = editBtn.closest('div').querySelector('strong');
            const exName = title ? title.textContent.trim() : null;
            const targetPlan = (activeEditor === 'creator') ? draftPlan : currentPlan;
            if (exName && targetPlan && targetPlan[dayIndex]) {
                const ex = targetPlan[dayIndex].exercises.find(ei => ei.name === exName);
                if (ex) { openExerciseForm({ mode: 'edit', dayIndex, exercise: ex }); }
            }
            return;
        }
    });

    // close modals when clicking outside
    window.addEventListener('click', (e) => {
        const formModal = document.getElementById('exercise-form-modal');
        const editModal = document.getElementById('edit-modal');
        if (e.target === formModal) formModal.style.display = 'none';
        if (e.target === editModal) editModal.style.display = 'none';
    });
}

// renderPlan (creator view uses renderCreator)
function renderPlan() {
    const planDiv = document.getElementById('training-plan');
    planDiv.innerHTML = '';
    currentPlan.forEach((dayObj, index) => {
        const dayDiv = document.createElement('div');
        dayDiv.classList.add('day-block');
        dayDiv.innerHTML = `<h3>Dzień ${dayObj.day}</h3><button class="add-exercise-btn">Dodaj ćwiczenie</button><div class="exercise-list"></div>`;
        dayDiv.setAttribute('data-day-index', String(index));
        planDiv.appendChild(dayDiv);

        const exerciseList = dayDiv.querySelector('.exercise-list');
        dayObj.exercises.forEach(exercise => {
            const item = document.createElement('div');
            const {name, series, reps, weight, increase} = exercise;
            item.innerHTML = `<strong>${name}</strong> — ${series} serie, ${reps} powtórzeń, ${weight}kg (+${increase})`;
            exerciseList.appendChild(item);
            item.addEventListener('click', () => showModal(item, exercise, index));
        });

        dayDiv.querySelector('.add-exercise-btn').addEventListener('click', () => {
            openExerciseForm({ mode: 'add', dayIndex: index });
        });
    });
}

function renderCreator() {
    const planDiv = document.getElementById('training-plan');
    planDiv.innerHTML = '';
    draftPlan.forEach((dayObj, index) => {
        const dayDiv = document.createElement('div');
        dayDiv.classList.add('day-block');
        dayDiv.innerHTML = `<h3>Dzień ${dayObj.day}</h3><button class="add-exercise-btn">Dodaj ćwiczenie</button><div class="exercise-list"></div>`;
        dayDiv.setAttribute('data-day-index', String(index));
        planDiv.appendChild(dayDiv);

        const exerciseList = dayDiv.querySelector('.exercise-list');
        dayObj.exercises.forEach(exercise => {
            const item = document.createElement('div');
            const {name, series, reps, weight, increase} = exercise;
            item.innerHTML = `<strong>${name}</strong> — ${series} serie, ${reps} powtórzeń, ${weight}kg (+${increase})`;
            exerciseList.appendChild(item);
            item.addEventListener('click', () => showModal(item, exercise, index));
        });
    });
}

function showModal(item, exercise, dayIndex) {
    const modal = document.getElementById('edit-modal');
    modal.style.display = 'flex';
    document.getElementById('edit-btn').onclick = () => {
        modal.style.display = 'none';
        openExerciseForm({ mode: 'edit', dayIndex, exercise });
    };
    document.getElementById('delete-btn').onclick = () => {
        modal.style.display = 'none';
        if (confirm('Czy na pewno chcesz usunąć to ćwiczenie?')) {
            const targetPlan = (activeEditor === 'creator') ? draftPlan : currentPlan;
            const day = targetPlan[dayIndex];
            const idx = day.exercises.indexOf(exercise);
            if (idx > -1) {
                day.exercises.splice(idx, 1);
                if (activeEditor === 'creator') renderCreator();
                else { savePlan(); renderSavedPlan(); }
            }
        }
    };
    document.getElementById('cancel-btn').onclick = () => { modal.style.display = 'none'; };
}

function openExerciseForm({ mode = 'add', dayIndex = 0, exercise = null } = {}) {
    const formModal = document.getElementById('exercise-form-modal');
    if (!formModal) return;

    formModal.style.display = 'flex';
    const titleEl = formModal.querySelector('.form-title');
    const nameSelect = document.getElementById('ex-name');
    const seriesInput = document.getElementById('ex-series');
    const repsInput = document.getElementById('ex-reps');
    const increaseInput = document.getElementById('ex-increase');
    const weightInput = document.getElementById('ex-weight');
    const weightIncBtn = document.getElementById('ex-weight-incr');
    const weightDecBtn = document.getElementById('ex-weight-decr');

    titleEl.textContent = mode === 'edit' ? 'Edytuj ćwiczenie' : 'Dodaj ćwiczenie';

    if (nameSelect && document.getElementById('exercise-list')) {
        if (nameSelect.options.length === 0) {
            let names = Array.from(document.querySelectorAll('#exercise-list li')).map(li => li.textContent.trim()).filter(Boolean);
            if (names.length === 0) {
                const raw = Array.from(document.querySelectorAll('#exercise-list div'))
                    .map(d => d.textContent.replace(/^[^:]+:\s*/,'').split(',').map(s => s.trim()))
                    .flat();
                names = raw.filter(Boolean);
            }
            const unique = [...new Set(names)].filter(Boolean);
            unique.forEach(ex => { const o = document.createElement('option'); o.value = ex; o.textContent = ex; nameSelect.appendChild(o); });
        }
    }

    if (exercise) {
        const name = exercise.name || '';
        let found = false;
        for (let i = 0; i < nameSelect.options.length; i++) {
            if (nameSelect.options[i].value === name) { nameSelect.selectedIndex = i; found = true; break; }
        }
        if (!found && name) { const o = document.createElement('option'); o.value = name; o.textContent = name; nameSelect.appendChild(o); nameSelect.selectedIndex = nameSelect.options.length - 1; }
        seriesInput.value = exercise.series || '';
        repsInput.value = exercise.reps || '';
        increaseInput.value = exercise.increase || '';
        weightInput.value = exercise.weight || '';
    } else {
        if (nameSelect && nameSelect.options.length > 0) nameSelect.selectedIndex = 0;
        seriesInput.value = '';
        repsInput.value = '';
        increaseInput.value = '';
        weightInput.value = '';
    }

    const saveBtn = document.getElementById('form-save-btn');
    const cancelBtn = document.getElementById('form-cancel-btn');

    function adjustWeight(deltaMultiplier) {
        const inc = parseFloat(increaseInput.value);
        const step = (!isNaN(inc) && inc > 0) ? inc : 1;
        let val = parseFloat(weightInput.value);
        if (isNaN(val)) val = 0;
        val = Math.round((val + deltaMultiplier * step) * 100) / 100;
        if (val < 0) val = 0;
        weightInput.value = val;
    }

    if (weightIncBtn) weightIncBtn.onclick = () => adjustWeight(1);
    if (weightDecBtn) weightDecBtn.onclick = () => adjustWeight(-1);

    function onSave() {
        const name = (nameSelect ? nameSelect.value : '').trim();
        const series = parseInt(seriesInput.value, 10);
        const reps = parseInt(repsInput.value, 10);
        const increase = parseFloat(increaseInput.value);
        const weight = parseFloat(weightInput.value);

        if (!name) { alert('Podaj nazwę ćwiczenia.'); return; }
        if (!Number.isInteger(series) || series <= 0) { alert('Liczba serii musi być dodatnią liczbą całkowitą.'); return; }
        if (!Number.isInteger(reps) || reps <= 0) { alert('Liczba powtórzeń musi być dodatnią liczbą całkowitą.'); return; }
        if (isNaN(increase) || increase <= 0) { alert('Przyrost musi być dodatnią liczbą (np. 2, 2.5, 5).'); return; }
        if (isNaN(weight) || weight < 0) { alert('Ciężar musi być liczbą nieujemną.'); return; }

        const weightsArr = Array.isArray(exercise && exercise.weights) && exercise ? exercise.weights.slice(0, series) : Array(series).fill(weight);
        if (!exercise) {
            for (let i = 0; i < series; i++) weightsArr[i] = weight;
        } else {
            while (weightsArr.length < series) weightsArr.push(weight);
            if (weightsArr.length > series) weightsArr.length = series;
        }

        const exObj = { name, series, reps, weight, increase, weights: weightsArr };
        const target = (activeEditor === 'creator') ? draftPlan : currentPlan;
        if (mode === 'edit') {
            const day = target[dayIndex];
            const idx = day.exercises.indexOf(exercise);
            if (idx > -1) {
                Object.assign(day.exercises[idx], exObj);
            }
        } else {
            target[dayIndex].exercises.push(exObj);
        }

        if (activeEditor === 'creator') {
            renderCreator();
        } else {
            savePlan();
            renderSavedPlan();
        }
        closeForm();
    }

    function closeForm() {
        if (weightIncBtn) weightIncBtn.onclick = null;
        if (weightDecBtn) weightDecBtn.onclick = null;
        saveBtn.removeEventListener('click', onSave);
        cancelBtn.removeEventListener('click', closeForm);
        formModal.style.display = 'none';
    }

    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', closeForm);
}

function renderSavedPlan() {
    const container = document.getElementById('saved-plan');
    if (!container) return;
    const previouslyOpen = Array.from(container.querySelectorAll('details[open]')).map(d => parseInt(d.getAttribute('data-day-index'), 10)).filter(n => !isNaN(n));
    container.innerHTML = '';
    if (!currentPlan || currentPlan.length === 0) { container.innerHTML = '<p>Brak zapisanego planu.</p>'; return; }
    function missingOneSets(arr) { const n = arr.length; const res = []; if (n === 0) return res; for (let i = 0; i < n; i++) res.push(arr.filter((_, idx) => idx !== i)); return res; }

    currentPlan.forEach((dayObj, dayIndex) => {
        const detailsEl = document.createElement('details'); detailsEl.classList.add('day-block'); detailsEl.setAttribute('data-day-index', String(dayIndex)); if (previouslyOpen.includes(dayIndex)) detailsEl.setAttribute('open', '');
        const summary = document.createElement('summary'); summary.textContent = `Dzień ${dayObj.day}`; detailsEl.appendChild(summary);
        let planSelect = null; const mixes = missingOneSets(dayObj.exercises);
        if (dayObj.exercises && dayObj.exercises.length > 0) {
            planSelect = document.createElement('select'); planSelect.className = 'set-select'; const baseOpt = document.createElement('option'); baseOpt.value = String(-1); baseOpt.textContent = 'Zestaw podstawowy'; planSelect.appendChild(baseOpt); mixes.forEach((m, mi) => { const opt = document.createElement('option'); opt.value = String(mi); opt.textContent = `Zestaw ${String.fromCharCode(65 + mi)}`; planSelect.appendChild(opt); }); const initialSel = (typeof dayObj.selectedSetIndex !== 'undefined') ? dayObj.selectedSetIndex : -1; planSelect.value = String(initialSel); planSelect.addEventListener('change', () => { dayObj.selectedSetIndex = parseInt(planSelect.value, 10); savePlan(); renderSavedPlan(); });
        }
        const content = document.createElement('div'); content.className = 'day-content'; content.style.marginTop = '8px'; if (planSelect) { const selWrap = document.createElement('div'); selWrap.style.marginBottom = '8px'; selWrap.appendChild(planSelect); content.appendChild(selWrap); }
        let exercisesToRender = dayObj.exercises; if (planSelect) { const sel = (typeof dayObj.selectedSetIndex !== 'undefined') ? dayObj.selectedSetIndex : -1; if (sel === -1) exercisesToRender = dayObj.exercises; else exercisesToRender = mixes[sel] || []; }
        exercisesToRender.forEach((ex, exIndex) => {
            if (!Array.isArray(ex.weights)) ex.weights = Array(ex.series).fill(ex.weight || 0); while (ex.weights.length < ex.series) ex.weights.push(ex.weight || 0); if (ex.weights.length > ex.series) ex.weights.length = ex.series;
            const wrapper = document.createElement('div'); wrapper.style.marginBottom = '12px'; const titleRow = document.createElement('div'); titleRow.style.display = 'flex'; titleRow.style.justifyContent = 'space-between'; titleRow.style.alignItems = 'center'; const title = document.createElement('strong'); title.textContent = ex.name; titleRow.appendChild(title);
            const editBtn = document.createElement('button'); editBtn.textContent = 'Edytuj'; editBtn.className = 'edit-btn'; editBtn.style.marginLeft = '8px'; editBtn.onclick = () => { openExerciseForm({ mode: 'edit', dayIndex, exercise: ex }); };
            titleRow.appendChild(editBtn); wrapper.appendChild(titleRow);
            const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.style.marginTop = '8px'; const tr1 = document.createElement('tr'); const td1 = document.createElement('td'); td1.colSpan = ex.series; td1.style.textAlign = 'center'; td1.style.padding = '6px'; td1.className = 'reps-cell'; td1.textContent = `Powtórzenia: ${ex.reps}`; tr1.appendChild(td1); table.appendChild(tr1);
            const tr2 = document.createElement('tr'); for (let s = 1; s <= ex.series; s++) { const th = document.createElement('th'); th.style.padding = '6px'; th.style.borderTop = '1px solid #e0e0e0'; th.textContent = `Seria ${s}`; tr2.appendChild(th); } table.appendChild(tr2);
            const tr3 = document.createElement('tr'); for (let s = 0; s < ex.series; s++) { const td = document.createElement('td'); td.style.padding = '6px'; td.style.textAlign = 'center'; td.style.borderTop = '1px solid #e0e0e0'; const input = document.createElement('input'); input.type = 'number'; input.step = '0.5'; input.min = '0'; input.className = 'series-input'; input.value = (typeof ex.weights[s] !== 'undefined') ? ex.weights[s] : (ex.weight || 0); const controlsDiv = document.createElement('div'); controlsDiv.className = 'series-controls'; const dec = document.createElement('button'); dec.textContent = '−'; const inc = document.createElement('button'); inc.textContent = '+'; dec.addEventListener('click', () => { const step = parseFloat(ex.increase) || 1; ex.weights[s] = Math.round(Math.max(0, (parseFloat(ex.weights[s] || 0) - step)) * 100) / 100; ex.weight = ex.weights[0]; savePlan(); }); inc.addEventListener('click', () => { const step = parseFloat(ex.increase) || 1; ex.weights[s] = Math.round(((parseFloat(ex.weights[s] || 0) + step)) * 100) / 100; ex.weight = ex.weights[0]; savePlan(); }); input.addEventListener('change', () => { let v = parseFloat(input.value); if (isNaN(v) || v < 0) v = 0; ex.weights[s] = Math.round(v * 100) / 100; ex.weight = ex.weights[0]; savePlan(); }); controlsDiv.appendChild(dec); controlsDiv.appendChild(input); controlsDiv.appendChild(inc); td.appendChild(controlsDiv); tr3.appendChild(td); }
            table.appendChild(tr3); wrapper.appendChild(table); content.appendChild(wrapper);
        });
        detailsEl.appendChild(content); container.appendChild(detailsEl);
    });
}

// initialization on DOM ready
window.addEventListener('DOMContentLoaded', async () => {
    // initially hide app until auth state is determined
    showAppRoot(false);
    showLogout(false);
    // load local override (if present) and validate Firebase config before proceeding
    try {
        await prepareConfig();
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        // show prominent alert and keep app hidden (can't proceed without valid config)
        alert('Konfiguracja Supabase jest nieprawidłowa. ' + msg);
        // still initialize the auth UI so user can see instructions, but stop further init
        initAuthUI();
        return;
    }
    initAuthUI();
    initAppLogic();
});
