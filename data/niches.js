// 봉안당(안치단) 규격 및 기본 설정
// 실제 매장에서 쓰는 규격에 맞게 이 목록을 수정하세요. "직접 입력"은 항상 마지막에 유지됩니다.

window.NICHE_PRESETS = [
  { id: "general25", label: "일반단 25 (25×25cm)", widthCm: 25, heightCm: 25, urnCount: 1 },
  { id: "general27", label: "일반단 27 (27×27cm)", widthCm: 27, heightCm: 27, urnCount: 1 },
  { id: "couple", label: "부부단 (60×30cm)", widthCm: 60, heightCm: 30, urnCount: 2 },
  { id: "custom", label: "직접 입력", widthCm: null, heightCm: null, urnCount: 1 }
];

window.NICHE_CONFIG = {
  defaultWidthCm: 25,   // 봉안당 내부 가로 길이(cm) 기본값
  defaultHeightCm: 25   // 봉안당 내부 세로 길이(cm) 기본값
};
