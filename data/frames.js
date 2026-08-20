// 액자 규격 데이터
// 실제 사용하시는 액자 규격에 맞게 이 파일의 숫자만 바꾸면 프로그램에 바로 반영됩니다.
// widthCm, heightCm 는 액자의 실제 가로/세로 길이(cm) (세로로 놓았을 때 기준입니다.)
// orientable: true 인 액자는 배치 화면에서 세로/가로 방향을 선택할 수 있습니다.
// 아래 값은 임시(예시) 값이니, 실제 액자 치수로 반드시 수정해서 사용하세요.

window.FRAME_DATA = [
  { id: "ho1", name: "1호", widthCm: 4.5, heightCm: 4.5 },
  { id: "ho2", name: "2호", widthCm: 4.5, heightCm: 6, orientable: true },
  { id: "ho3", name: "3호", widthCm: 6, heightCm: 6 },
  { id: "ho4", name: "4호", widthCm: 6, heightCm: 8, orientable: true },
  { id: "ho5", name: "5호", widthCm: 8, heightCm: 8 },
  { id: "ho6", name: "6호", widthCm: 8, heightCm: 10.5, orientable: true },
  { id: "ho7", name: "7호", widthCm: 10.5, heightCm: 10.5 },
  { id: "ho8", name: "8호", widthCm: 10.5, heightCm: 14, orientable: true },
  { id: "wipae", name: "위패 액자", widthCm: 6.5, heightCm: 14.5 }
];
