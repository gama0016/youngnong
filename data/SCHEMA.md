# 작목 데이터 스키마 (data/crops/<cntntsNo>.json)

모든 값은 농사로 「농작업일정」 상세 페이지에 실제로 적힌 내용만 담는다. 페이지에 없는 값은 null/빈 배열.

```json
{
  "id": 30600,
  "name": "고추",
  "type": "보통재배",
  "category": "채소",
  "sciName": "Capsicum annuum L.",
  "family": "가지과",
  "summary": "작목 특성 한두 문장(페이지 내용 요약)",
  "env": [ { "label": "생육 적온", "value": "20~30℃" } ],
  "schedule": [
    { "task": "씨뿌림", "kind": "sow", "region": "남부",
      "start": { "m": 2, "p": 1 }, "end": { "m": 2, "p": 2 }, "text": "2월 초순~2월 중순" }
  ],
  "stages": [
    { "title": "아주심기", "timing": "남부 4월 하순~5월 상순 / 중부 5월 상순~5월 중순",
      "items": [ { "label": "심는 거리(1줄)", "value": "100cm×35~40cm" } ] }
  ],
  "fertilizer": {
    "unit": "kg/10a",
    "columns": ["합계", "밑거름", "웃거름 1회", "웃거름 2회", "웃거름 3회"],
    "rows": [ { "name": "질소", "values": [19.0, 10.2, 2.8, 3.2, 2.8] } ],
    "note": null
  },
  "pests": [ { "name": "탄저병", "kind": "병", "timing": "장마철", "control": "7~10일 간격 살균제 살포" } ],
  "disasters": [ { "risk": "장마", "timing": null, "measures": ["배수구 정비"] } ],
  "notes": ["기타 페이지에 있는 유용한 수치·기준"],
  "source": "https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30600"
}
```

- `kind`: sow(파종) | nursery(육묘) | plant(정식·이앙·심기) | manage(관리·전정·유인 등) | fert(비료) | pest(방제) | harvest(수확) | etc
- `start`/`end`: m = 월(1~12), p = 순(1 상·초순, 2 중순, 3 하순, 순이 없으면 null). 페이지에 시기가 명시되지 않으면 start/end 모두 null.
- `region`: 남부/중부/고랭지 등 지역 구분이 있을 때만, 없으면 null.
- `pests.kind`: 병 | 해충 | 생리장해 | 잡초
- `fertilizer.rows.values`: columns 와 같은 길이. 값이 없으면 null.
