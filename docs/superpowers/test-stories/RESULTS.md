# Rich-Component Recursive Loop — Results (2026-06-14)

Validated each rich component end-to-end via /api/article-test (now removed) + a render
harness, with screenshot inspection. All four cleared their quality bar.

## Outcomes
- **Map2D** (Orient Express route): PASS first try. 7 cities with accurate real coordinates
  (Paris 48.86,2.35 … Istanbul 41.01,28.98), orange route line, narrative fly-between cards.
- **DataScrolly** (genome-sequencing cost): PASS after fix. Bar chart with the exact source
  numbers ($100M→$600, 2001–2022), correct axes, narrative step cards.
- **Scene3D** (Antikythera Mechanism): PASS after fix. Mock object renders; 4 source-grounded
  scene narratives (glbUrl auto-injected as the mock).
- **AudioPlayer** (telephone operators oral history): PASS after fix. Mock cover + real
  title/subtitle/description + waveform; audio file is upload-pending.

## Bugs found & fixed by the loop
1. Planner ignored a clear numeric series → added CONTENT SIGNALS so numbers force DataScrolly.
2. Planner ignored a physical-object story → added a physical_object fact flag + OBJECT SIGNAL → Scene3D.
3. Planner ignored audio material → added an audio fact flag + (forceful) AUDIO SIGNAL → AudioPlayer.
4. deepseek intermittently returns an empty/unparseable plan → repairPlanStructure now rebuilds a
   content-aware arc from factShape so the signaled rich components still appear (no bare
   Hero/ImageGrid/Outro collapse). Map2D/DataScrolly/Scene3D now count as visual blocks.

## Reliability note
The all-in-one pipeline exceeds Cloudflare's ~60s edge limit; production generates per-block
from the admin (each block its own request), which is fine. The test endpoint was phased
(analyze | block) to measure within the limit.
