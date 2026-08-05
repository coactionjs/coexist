---
"@coexist/react": patch
"@coexist/svelte": patch
---

Bound the React and Svelte peer ranges to the majors these adapters are tested against. `">=18.3.0 || >=19.0.0"` and `">=4.0.0 || >=5.0.0"` each collapse to their lower bound, so the packages silently claimed compatibility with React 20+ and Svelte 6+ — unlike the Angular, Vue, and Solid adapters, which all cap their ranges. They are now `"^18.3.0 || ^19.0.0"` and `"^4.0.0 || ^5.0.0"`.
