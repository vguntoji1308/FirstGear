'use strict';
(function () {
  const $ = (selector) => document.querySelector(selector);
  let token = sessionStorage.getItem('sdlc-token');
  let currentId = null, busy = false;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const message = (text, error = false) => {
    $('#message').replaceChildren(el('p', text, `alert ${error ? 'error' : 'info'}`));
  };
  async function call(url, method = 'GET', body) {
    const response = await fetch(`/api${url}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) signout();
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }
  async function action(work) {
    if (busy) return;
    busy = true;
    $('#studio').setAttribute('aria-busy', 'true');
    try { await work(); }
    catch (error) { message(error.message, true); }
    finally { busy = false; $('#studio').setAttribute('aria-busy', 'false'); }
  }
  function signout() {
    token = null; currentId = null;
    sessionStorage.removeItem('sdlc-token');
    $('#studio').hidden = true; $('#signin').hidden = false;
    $('#runs').replaceChildren(); $('#run').replaceChildren();
    message('Signed out.');
  }
  async function models() {
    $('#model').replaceChildren(el('option', 'Select an installed model'));
    $('#model').firstChild.value = '';
    try {
      const data = await call('/sdlc/models');
      for (const name of data.models) {
        const option = el('option', name); option.value = name; $('#model').append(option);
      }
      if (data.models.includes(data.defaultModel)) $('#model').value = data.defaultModel;
      else if (data.models.length === 1) $('#model').value = data.models[0];
      $('#provider').textContent = data.models.length ? `Ollama connected: ${data.models.length} model(s)` : 'Ollama connected, but no model is installed. Pull a model locally.';
    } catch (error) {
      $('#provider').textContent = error.message;
      throw error;
    }
  }
  async function list() {
    const data = await call('/sdlc/runs');
    $('#runs').replaceChildren();
    for (const run of data.runs) {
      const button = el('button', `${run.title} (${run.model})`, 'btn ghost small');
      button.type = 'button';
      if (run.id === currentId) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => action(() => load(run.id)));
      const item = el('li'); item.append(button); $('#runs').append(item);
    }
    if (!data.runs.length) $('#runs').append(el('li', 'No saved runs yet.'));
  }
  async function load(id) {
    currentId = id;
    render(await call(`/sdlc/runs/${id}`));
    await list();
  }
  function button(text, work) {
    const node = el('button', text, 'btn small'); node.type = 'button';
    node.addEventListener('click', () => action(work)); return node;
  }
  function render(run) {
    const container = $('#run');
    container.replaceChildren(el('h2', run.title), el('p', run.request));
    container.append(el('p', `Model: ${run.model}. ${run.complete ? 'All proposal stages approved; nothing has been applied or deployed.' : 'Approve each output before starting the next stage.'}`, 'muted'));
    const exportButton = button('Export artifacts (JSON)', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
      const link = el('a'); link.href = url; link.download = `sdlc-${run.id}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    container.append(exportButton);
    const active = run.steps.find((step) => step.status !== 'approved');
    for (const step of run.steps) {
      const section = el('section', undefined, 'studio-stage');
      const heading = el('h3', `${step.position + 1}. ${step.role.replaceAll('-', ' ')}`);
      heading.append(el('span', step.status.replaceAll('_', ' '), `pill ${step.status}`));
      section.append(heading);
      if (step.error) section.append(el('p', step.error, 'alert error'));
      if (step.output) {
        section.append(el('p', step.output.summary), el('pre', step.output.artifact));
        const risks = el('ul'); step.output.risks.forEach((risk) => risks.append(el('li', risk)));
        section.append(risks);
      }
      if (step.approved_at) section.append(el('p', `Approved by admin ${step.approved_by} at ${step.approved_at}`, 'muted'));
      if (step.feedback) section.append(el('p', `Review feedback: ${step.feedback}`, 'muted'));
      if (active === step) {
        const actions = el('div', undefined, 'studio-actions');
        if (['pending', 'failed'].includes(step.status)) actions.append(button('Generate this stage', async () => {
          message('Generating locally. This can take up to two minutes. No commands are being executed.');
          try {
            const result = await call(`/sdlc/runs/${run.id}/advance`, 'POST');
            render(result); message('Artifact generated. Review it before approving.');
          } finally { await load(run.id); }
        }));
        if (step.status === 'running') actions.append(button('Refresh generation status', () => load(run.id)));
        if (step.status === 'awaiting_approval') {
          const feedback = el('textarea'); feedback.maxLength = 4000;
          feedback.setAttribute('aria-label', 'Review feedback'); feedback.placeholder = 'Feedback (required to request revision)';
          section.append(feedback);
          const review = async (decision) => {
            if (decision === 'revise' && !feedback.value.trim()) throw new Error('Provide revision feedback first.');
            render(await call(`/sdlc/runs/${run.id}/review`, 'POST', { decision, feedback: feedback.value }));
            message(decision === 'approve' ? 'Output approved. Start the next agent when ready.' : 'Revision requested. Generate this stage again.');
          };
          actions.append(button('Approve output only', () => review('approve')), button('Request revision', () => review('revise')));
        }
        section.append(actions);
      }
      container.append(section);
    }
  }
  async function enter() {
    await list();
    $('#signin').hidden = true; $('#studio').hidden = false;
    await models();
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('#signin-form').addEventListener('submit', (event) => {
      event.preventDefault();
      action(async () => {
        const data = await call('/auth/login', 'POST', { email: $('#email').value, password: $('#password').value });
        token = data.token; sessionStorage.setItem('sdlc-token', token); $('#password').value = '';
        await enter();
      });
    });
    $('#signout').addEventListener('click', signout);
    $('#check-models').addEventListener('click', () => action(models));
    $('#refresh-runs').addEventListener('click', () => action(async () => { await list(); if (currentId) await load(currentId); }));
    $('#new-run').addEventListener('submit', (event) => {
      event.preventDefault();
      action(async () => {
        const run = await call('/sdlc/runs', 'POST', { title: $('#title').value, request: $('#request').value, model: $('#model').value });
        await load(run.id); message('Run saved. Start the Product Manager stage.');
      });
    });
    if (token) action(enter);
  });
})();
