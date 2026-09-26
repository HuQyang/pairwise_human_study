// Edit this file to add your real study samples.
// image can be a path like "/images/sample01-a.png" after placing files in public/images.
export const studyConfig = {
  title: "Pairwise Human Evaluation",
  intro: "You will see two results generated from the same input. Please select the result you prefer according to the criterion shown. There are no right or wrong answers.",
  allowTie: true,
  questions: [
    {
      id: "overall_quality",
      text: "Which result has better overall visual quality?"
    }
  ],
  comparisons: [
    {
      id: "sample-001",
      prompt: "Optional input / prompt caption goes here.",
      a: { method: "Method A", caption: "Optional caption A", image: "" },
      b: { method: "Method B", caption: "Optional caption B", image: "" }
    },
    {
      id: "sample-002",
      prompt: "Optional input / prompt caption goes here.",
      a: { method: "Method A", caption: "Optional caption A", image: "" },
      b: { method: "Method B", caption: "Optional caption B", image: "" }
    },
    {
      id: "sample-003",
      prompt: "Optional input / prompt caption goes here.",
      a: { method: "Method A", caption: "Optional caption A", image: "" },
      b: { method: "Method B", caption: "Optional caption B", image: "" }
    }
  ]
};
