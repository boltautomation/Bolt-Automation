(() => {
  const results = [];
  const fixture = document.getElementById('fixture');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  function call(action, data = {}) {
    let result;
    globalThis.contentListener({ type: 'chatter-bot', action, config: {}, ...data }, { id: 'test-extension' }, response => { result = response; });
    if (!result.ok) throw new Error(result.error);
    return result.result;
  }
  function test(name, fn) {
    try { fn(); results.push(`PASS ${name}`); }
    catch (error) { results.push(`FAIL ${name}: ${error.message}`); }
    fixture.replaceChildren();
  }
  const quiz = `<form><fieldset><legend>Which city is the capital of Canada?</legend><label><input type="radio" name="answer" value="a">Toronto</label><label><input type="radio" name="answer" value="b">Ottawa</label><a href="https://www.canada.ca/">Research</a></fieldset><button type="button">Submit Answer</button></form>`;
  test('extracts prompt, labels, source links and submit control', () => {
    fixture.innerHTML = quiz;
    const scan = call('scan');
    assert(scan.questions.length === 1, 'expected one question');
    assert(scan.questions[0].text.includes('capital of Canada'), 'prompt missing');
    assert(scan.questions[0].options[1].text === 'Ottawa', 'incorrect label');
    assert(scan.questions[0].links[0].url === 'https://www.canada.ca/', 'source missing');
    assert(scan.submitCount === 1, 'submit missing');
  });
  test('fills using real clicks and submits once', () => {
    fixture.innerHTML = quiz; let clicked = 0, changed = 0;
    fixture.querySelector('button').onclick = () => clicked++;
    fixture.querySelectorAll('input')[1].onchange = () => changed++;
    const scan = call('scan');
    call('fill', { fingerprint: scan.fingerprint, answers: [{ id: 'q0', optionIds: ['o1'] }] });
    assert(fixture.querySelectorAll('input')[1].checked, 'answer not selected');
    assert(changed === 1, 'native change not fired');
    call('submit', { fingerprint: scan.fingerprint });
    assert(clicked === 1, 'submit did not fire once');
  });
  test('finds resource links beside a fieldset in the same question form', () => {
    fixture.innerHTML = quiz.replace('<a href="https://www.canada.ca/">Research</a>', '').replace('</fieldset>', '</fieldset><a href="https://www.canada.ca/">Research this question</a>');
    assert(call('scan').questions[0].links[0].url === 'https://www.canada.ca/', 'sibling research link missing');
  });
  test('rejects stale page before changing any inputs', () => {
    fixture.innerHTML = quiz; const scan = call('scan');
    fixture.querySelector('legend').textContent = 'A changed question';
    let rejected = false;
    try { call('fill', { fingerprint: scan.fingerprint, answers: [{ id: 'q0', optionIds: ['o1'] }] }); } catch { rejected = true; }
    assert(rejected && !fixture.querySelector('input:checked'), 'stale answer selected');
  });
  test('rejects invalid answer IDs before changing the page', () => {
    fixture.innerHTML = quiz; const scan = call('scan'); let rejected = false;
    try { call('fill', { fingerprint: scan.fingerprint, answers: [{ id: 'q0', optionIds: ['o999'] }] }); } catch { rejected = true; }
    assert(rejected && !fixture.querySelector('input:checked'), 'invalid answer applied');
  });
  test('checkbox questions uncheck unwanted choices', () => {
    fixture.innerHTML = `<fieldset><legend>Choose all the even numbers.</legend><label><input type="checkbox" name="numbers" checked>One</label><label><input type="checkbox" name="numbers">Two</label><label><input type="checkbox" name="numbers">Four</label></fieldset>`;
    const scan = call('scan'); assert(scan.questions[0].multiple, 'not multi-select');
    call('fill', { fingerprint: scan.fingerprint, answers: [{ id: 'q0', optionIds: ['o1', 'o2'] }] });
    assert([...fixture.querySelectorAll('input')].map(input => input.checked).join() === 'false,true,true', 'incorrect checkbox selection');
  });
  test('separates questions with identical radio names in separate forms', () => {
    fixture.innerHTML = quiz + quiz;
    assert(call('scan').questions.length === 2, 'form scopes merged');
  });
  test('ignores hidden and disabled questions', () => {
    fixture.innerHTML = `<div hidden>${quiz}</div>` + quiz.replaceAll('type="radio"', 'disabled type="radio"');
    assert(call('scan').questions.length === 0, 'unavailable questions included');
  });
  test('ignores controls disabled by their parent fieldset', () => {
    fixture.innerHTML = quiz.replace('<fieldset>', '<fieldset disabled>');
    assert(call('scan').questions.length === 0, 'disabled fieldset included');
  });
  test('finds a styled hidden input through a visible label', () => {
    fixture.innerHTML = quiz.replaceAll('type="radio"', 'style="display:none" type="radio"');
    const scan = call('scan'); assert(scan.questions.length === 1, 'styled inputs not found');
    call('fill', { fingerprint: scan.fingerprint, answers: [{ id: 'q0', optionIds: ['o1'] }] });
    assert(fixture.querySelectorAll('input')[1].checked, 'styled input click failed');
  });
  test('accessible custom radio widgets work', () => {
    fixture.innerHTML = `<fieldset role="radiogroup"><legend>Choose the correct city.</legend><button role="radio" aria-checked="false">A</button><button role="radio" aria-checked="false">B</button></fieldset>`;
    const choices = [...fixture.querySelectorAll('[role=radio]')];
    for (const choice of choices) choice.onclick = () => choices.forEach(item => item.setAttribute('aria-checked', String(item === choice)));
    const scan = call('scan');
    call('fill', { fingerprint: scan.fingerprint, answers: [{ id: 'q0', optionIds: ['o1'] }] });
    assert(choices[1].getAttribute('aria-checked') === 'true', 'custom choice not selected');
  });
  test('ambiguous submit buttons never get clicked', () => {
    fixture.innerHTML = quiz.replace('</form>', '<button type="button">Submit</button></form>'); let clicks = 0;
    for (const button of fixture.querySelectorAll('button')) button.onclick = () => clicks++;
    const scan = call('scan'); let rejected = false;
    try { call('submit', { fingerprint: scan.fingerprint }); } catch { rejected = true; }
    assert(rejected && clicks === 0, 'ambiguous button clicked');
  });
  test('a manual answer change between fill and submit stops submission', () => {
    fixture.innerHTML = quiz; let clicks = 0;
    fixture.querySelector('button').onclick = () => clicks++;
    const scan = call('scan'); const answers = [{ id: 'q0', optionIds: ['o1'] }];
    call('fill', { fingerprint: scan.fingerprint, answers });
    fixture.querySelector('input').click();
    let rejected = false;
    try { call('submit', { fingerprint: scan.fingerprint, answers }); } catch { rejected = true; }
    assert(rejected && clicks === 0, 'changed answers submitted');
  });
  test('completion and Next screens are detected', () => {
    fixture.innerHTML = '<p>You have completed the Daily Quiz.</p>';
    assert(call('scan').complete, 'completion not detected');
    fixture.innerHTML = '<p>Correct answer!</p><button>Next Question</button>';
    assert(call('scan').nextCount === 1, 'next not detected');
  });
  test('invalid CSS selector is reported without mutations', () => {
    let rejected = false;
    try { call('scan', { config: { questionSelector: '[' } }); } catch { rejected = true; }
    assert(rejected, 'invalid selector not reported');
  });
  test('four-question survey matches screenshot and advances with No / lowest interest', () => {
    const yesNo = name => `<div><label><input type="radio" name="${name}">Yes</label><label><input type="radio" name="${name}">No</label></div>`;
    const rating = name => `<div>${['4 - Very Interesting','3 - Interesting','2 - Somewhat Interesting','1 - Not Interesting'].map(value => `<label><input type="radio" name="${name}">${value}</label>`).join('')}</div>`;
    fixture.innerHTML = `<form><p>Have you heard of Let's Talk Science - Parlons Sciences before?</p>${yesNo('heard')}<p>How interesting is Let's Talk Science - Parlons Sciences to you?</p>${rating('science-interest')}<p>Did you know you could study business administration and management, general or do this as a job?</p>${yesNo('aware')}<p>How interesting is business administration and management, general to you?</p>${rating('career-interest')}<button type="button">Next Question</button></form>`;
    const scan = call('scan');
    assert(scan.questions.length === 4, 'survey groups not detected');
    assert(scan.submitCount === 0 && scan.nextCount === 1, 'wrong survey navigation');
    const answers = scan.questions.map(question => ({ id: question.id, optionIds: globalThis.ChatterCore.surveyAnswer(question)?.optionIds }));
    assert(answers.every(answer => answer.optionIds), 'survey prompt classification failed');
    call('fill', { fingerprint: scan.fingerprint, answers });
    assert([...fixture.querySelectorAll('input:checked')].map(input => input.parentElement.textContent).join('|') === 'No|1 - Not Interesting|No|1 - Not Interesting', 'wrong survey choices');
    let clicked = 0; fixture.querySelector('button').onclick = () => clicked++;
    call('next', { fingerprint: scan.fingerprint, answers }); assert(clicked === 1, 'Next not clicked exactly once');
  });
  test('real site layout reads the prompt above the form and never reads hidden values', () => {
    const resource = btoa('https://chatterhigh.com/en/qp/example/questions/123/hint?systemBrowser=1');
    fixture.innerHTML = `<p>Which city is the capital of Canada?</p><p class="hint">Hint: Use the Research button to find the answer.</p><form><input type="hidden" name="authenticity_token" value="DO-NOT-READ-HIDDEN-VALUES"><div><label><input type="radio" name="answer">Toronto</label><label><input type="radio" name="answer">Ottawa</label></div><button type="button" data-ref="${resource}">Research +50</button><a href="#">Submit</a><a href="#">Click here to report</a></form>`;
    const scan = call('scan'), question = scan.questions[0];
    assert(question.prompt === 'Which city is the capital of Canada?', 'actual prompt missing');
    assert(!JSON.stringify(scan).includes('DO-NOT-READ-HIDDEN-VALUES'), 'hidden form value leaked');
    assert(question.links.length === 1 && question.links[0].url.endsWith('/en/qp/example/questions/123/hint?systemBrowser=1'), 'research data-ref not decoded or navigation links included');
  });
  test('Research bonus text changes do not invalidate the current question', () => {
    fixture.innerHTML = quiz.replace('</fieldset>','<button type="button" data-ref="'+btoa('https://www.canada.ca/research')+'">Research +50</button></fieldset>');
    const scan = call('scan');fixture.querySelector('button').textContent='Research';
    assert(call('scan').fingerprint===scan.fingerprint,'Research state changed question identity');
    call('fill',{fingerprint:scan.fingerprint,answers:[{id:'q0',optionIds:['o1']}]});
    assert(fixture.querySelectorAll('input')[1].checked,'stable question could not be filled');
  });
  test('native module-completion page is recognized instead of reporting no questions',()=>{
    fixture.innerHTML='<h1>Course Complete. Great Job!</h1><p>You have completed all the questions for this module.</p><p>Correct Answers 16/16</p>';
    assert(call('scan').complete,'native module completion not recognized');
  });
  test('True/False with duplicate N/A retains original DOM positions and clears checkbox leftovers',()=>{
    for(const type of ['radio','checkbox']){
      fixture.innerHTML=`<form><fieldset><legend>Ottawa is the capital of Canada.</legend>${['N/A','False','True','N/A'].map(label=>`<label><input type="${type}" name="answer">${label}</label>`).join('')}</fieldset><button type="button">Submit</button></form>`;
      const inputs=fixture.querySelectorAll('input');inputs[3].click();
      const scan=call('scan');assert(scan.questions.length===1&&!scan.questions[0].multiple,'True/False was treated as multiple choice');
      let rejected=false;try{call('fill',{fingerprint:scan.fingerprint,answers:[{id:'q0',optionIds:['o3']}]});}catch{rejected=true;}
      assert(rejected,'N/A placeholder was allowed');
      call('fill',{fingerprint:scan.fingerprint,answers:[{id:'q0',optionIds:['o2']}]});
      assert([...inputs].filter(input=>input.checked).length===1&&inputs[2].checked,'wrong True/False input selected or stale placeholder remained');
    }
  });
  document.getElementById('results').textContent = results.join('\n');
  document.documentElement.dataset.testResult = results.some(line => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
})();
