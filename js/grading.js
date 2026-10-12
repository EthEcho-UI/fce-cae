// Pure grading logic per question type — no DOM. userAnswer shapes:
//  mcCloze/multipleChoice: number index or null
//  openCloze/wordFormation/transformation: string
//  gappedText/crossText/multipleMatching: letter string or null
import { matchesAny, basicNormalize } from './normalize.js';

export function gradeQuestion(set, q, userAnswer, overrideAnswers) {
  const type = set.type;
  overrideAnswers = overrideAnswers || [];
  if (type === 'mcCloze' || type === 'multipleChoice') {
    const chosen = userAnswer;
    const correct = chosen !== null && chosen !== undefined && chosen === q.answer;
    return {
      correct, type, userAnswer: chosen,
      correctAnswer: q.answer, correctText: q.options[q.answer],
      chosenWhy: (chosen !== null && chosen !== undefined) ? q.why[chosen] : null,
      whys: q.why, options: q.options,
    };
  }
  if (type === 'openCloze' || type === 'wordFormation') {
    const allAnswers = (q.answers || []).concat(overrideAnswers);
    const given = userAnswer || '';
    const correct = given.trim() !== '' && matchesAny(given, allAnswers, false);
    const cw = q.commonWrong && q.commonWrong[basicNormalize(given)];
    return {
      correct, type, userAnswer: given, correctAnswers: q.answers,
      explanation: q.explanation, commonWrongNote: cw || null, stem: q.stem,
    };
  }
  if (type === 'transformation') {
    const allAnswers = (q.answers || []).concat(overrideAnswers);
    const given = userAnswer || '';
    const correct = given.trim() !== '' && matchesAny(given, allAnswers, true);
    return { correct, type, userAnswer: given, correctAnswers: q.answers, explanation: q.explanation };
  }
  if (type === 'gappedText') {
    const correct = !!userAnswer && userAnswer === q.answer;
    return { correct, type, userAnswer: userAnswer || null, correctAnswer: q.answer, explanation: q.explanation };
  }
  if (type === 'crossText' || type === 'multipleMatching') {
    const correct = !!userAnswer && userAnswer === q.answer;
    return {
      correct, type, userAnswer: userAnswer || null, correctAnswer: q.answer,
      explanation: q.explanation, prompt: q.prompt,
    };
  }
  return { correct: false, type, userAnswer };
}

export function isAnswered(type, userAnswer) {
  if (type === 'mcCloze' || type === 'multipleChoice') return userAnswer !== null && userAnswer !== undefined;
  if (type === 'gappedText' || type === 'crossText' || type === 'multipleMatching') return !!userAnswer;
  return !!(userAnswer && String(userAnswer).trim());
}
