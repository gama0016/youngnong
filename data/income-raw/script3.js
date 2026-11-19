$(document).ready(function($){
	toolTip.initModule();
});

var toolTip=(function(){
	//1.  해당툴팁 마우스 오버시 : ARtoolMsg.s_content 내용 보여줌 (HTML 태그 사용 )
	//2-1.  해당툴팁 마우스 클릭시 : ARtoolMsg.content 내용 보여줌 (HTML 태그 사용 )
	//2-2. 해당툴팁 마우스 클릭시 : ARtoolMsg.link:"#외부 링크" 로 연결
	//3  클릭팝업 사용 여부   : ARtoolMsg.click (true, false)로 클릭이벤트 사용여부 제어
	var
		tooltip_index,
		ARtooltipMSG=[
			{
				"name" 		: "부담면적" //TItle
				, "s_content" 	: "농기계의 부담면적이란 작업적기 동안에 그 농기계가 지닌 고유성능을 발휘하여 작업할 수 있는 최대면적을 말한다.(단, 트랙터는 정지(로터리) 작업 기준)따라서 농기계 이용비용은 부담면적에 달하는 면적을 작업했을 경우가 단위 면적당 최소가 된다.'" // 요약툴팁
				, "content" 		: "농기계의 부담면적이란 작업적기 동안에 그 농기계가 지닌 고유성능을 발휘하여 작업할 수 있는 최대면적을 말한다.(단, 트랙터는 정지(로터리) 작업 기준)따라서 농기계 이용비용은 부담면적에 달하는 면적을 작업했을 경우가 단위 면적당 최소가 된다." // 전체 내용
				, "click" 		: false
				, "link" 			: "" // 개별 툴팁 URL이 있을경우
			},
			{
				"name"			: "손익분기규모"
				, "s_content"	: "농기계의 손익분기 규모란 기계작업의 경제적인 대체규모를 판정하는데, 즉 투입된 농기계의 기계이용비용과 관행작업 비용 또는 임작업료를 기준한 수입이 같아질 때의 작업면적을 말한다.(단, 트랙터는 경운, 정지, 균평작업 기준)"
				, "content"		: "농기계의 손익분기 규모란 기계작업의 경제적인 대체규모를 판정하는데, 즉 투입된 농기계의 기계이용비용과 관행작업 비용 또는 임작업료를 기준한 수입이 같아질 때의 작업면적을 말한다.(단, 트랙터는 경운, 정지, 균평작업 기준)"
				, "click"			: false
				, "link" 			: ""
			},
			{
				"name" 		: "이용비용"
				, "s_content" 	: "농업기계 이용비용은 농업기계를 사용하여 작업할 때의 비용으로 고정비와 변동비로 구분한다. 고정비는 감가상각비, 자본이자 등 기계의 가동에 관계없이 총액에서 일정하다고 보는 비용이며, 변동비는 인건비, 유류비, 윤활유비 등 기계 가동에 비례하여 증감하는 비용을 말한다."
				, "content" 		: "농업기계 이용비용은 농업기계를 사용하여 작업할 때의 비용으로 고정비와 변동비로 구분한다. 고정비는 감가상각비, 자본이자 등 기계의 가동에 관계없이 총액에서 일정하다고 보는 비용이며, 변동비는 인건비, 유류비, 윤활유비 등 기계 가동에 비례하여 증감하는 비용을 말한다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "고정비"
				, "s_content" 	: "※ 기본으로 해당 기종, 규격에 대한 각 항목값들이 검색되어 입력됩니다. ※트랙터는 경운, 정지, 균평, 방제, 운반, 로더 작업 등 다양한 산정하였음.따라서 본체가격은 전체작업에 이용되고 있는데, 이용비용은 경운, 정지, 균평 작업을 기준하여  이용시간 가운데 경운, 정지, 균평 작업에 이용되는 60%만을 적용하였음. "
				, "content" 		: "※ 기본으로 해당 기종, 규격에 대한 각 항목값들이 검색되어 입력됩니다. ※트랙터는 경운, 정지, 균평, 방제, 운반, 로더 작업 등 다양한 산정하였음.따라서 본체가격은 전체작업에 이용되고 있는데, 이용비용은 경운, 정지, 균평 작업을 기준하여  이용시간 가운데 경운, 정지, 균평 작업에 이용되는 60%만을 적용하였음. "
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "Ha당 유동비 계산"
				, "s_content" 	: "※ 기본으로 해당 기종, 규격에 대한 각 항목값들이 검색되어 입력됩니다.  * 직접 각 항목을 입력하여 계산할 수도 있습니다.  ※ 균평작업의 경우 정지작업 값을 입력하면 동일하게 적용됩니다."
				, "content" 		: "※ 기본으로 해당 기종, 규격에 대한 각 항목값들이 검색되어 입력됩니다.  * 직접 각 항목을 입력하여 계산할 수도 있습니다.  ※ 균평작업의 경우 정지작업 값을 입력하면 동일하게 적용됩니다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "농기계선택"
				, "s_content" 	: "구입하고자 하는 농기계를 선택합니다."
				, "content" 		: "구입하고자 하는 농기계를 선택합니다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "지역선택"
				, "s_content" 	: "사는 곳의 지역을 선택하고, 경작지에 대한 지대정보를 선택합니다. 그리고 경지정리 상태를 선택합니다."
				, "content" 		: "사는 곳의 지역을 선택하고, 경작지에 대한 지대정보를 선택합니다. 그리고 경지정리 상태를 선택합니다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "논면적"
				, "s_content" 	: "기본값은 자가 논 면적입니다.다른 집의 벼도 말려야 하는 경우에는 자가 논 면적에 다른 집 논 면적으로 합하여 입력하세요."
				, "content" 		: "기본값은 자가 논 면적입니다.다른 집의 벼도 말려야 하는 경우에는 자가 논 면적에 다른 집 논 면적으로 합하여 입력하세요."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "작업시간"
				, "s_content" 	: "하루 작업시간은 10시간을 기본으로 입력하였습니다. 직접 수정을 원하시면 작업시간을 입력하세요."
				, "content" 		: "하루 작업시간은 10시간을 기본으로 입력하였습니다. 직접 수정을 원하시면 작업시간을 입력하세요."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "농기계제조사검색"
				, "s_content" 	: "선호하는 제조사가 있을 경우 검색하여 농기계 제조사를 선택합니다.<br/>선택된 제조사의 농기계를 검색합니다."
				, "content" 		: "선호하는 제조사가 있을 경우 검색하여 농기계 제조사를 선택합니다.<br/>선택된 제조사의 농기계를 검색합니다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "농기계수명"
				, "s_content" 	: "농기계수명"
				, "content" 		: "농기계수명"
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "선정폭지수"
				, "s_content" 	: "선정폭 지수는 농기계의 작업능률을 검색하는데 있어서 검색폭을 넓여주는 값이다. 선정폭 지수를 높여주면 계산된 작업능를의 폭을 넓여 검색하므로 보다 많은 농기계가 검색되며, 선정폭 지수를 낮혀주면 작업능률의 폭을 좁혀 검색하므로 많은 농기계가 검색되었을때 농기계 검색결과를 줄일 수 있다."
				, "content" 		: "선정폭 지수는 농기계의 작업능률을 검색하는데 있어서 검색폭을 넓여주는 값이다. 선정폭 지수를 높여주면 계산된 작업능를의 폭을 넓여 검색하므로 보다 많은 농기계가 검색되며, 선정폭 지수를 낮혀주면 작업능률의 폭을 좁혀 검색하므로 많은 농기계가 검색되었을때 농기계 검색결과를 줄일 수 있다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "농기계검색"
				, "s_content" 	: "분홍색으로 표시된 부분은 경작지 면적대비 손익분기 면적 이하의 기종이고, 하얀색으로 표시된 부분은 손익분기 면적이상의 기종이다."
				, "content" 		: "분홍색으로 표시된 부분은 경작지 면적대비 손익분기 면적 이하의 기종이고, 하얀색으로 표시된 부분은 손익분기 면적이상의 기종이다."
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "농작업일정"
				, "s_content" 	: "<strong>구축 대상 : 10분야 , 177작목</strong>작목의 특성을 고려해 생산성을 향상 시킬 수 있도록 축산분야 13건은 주요작업, 사양관리, 방역관리 등의 정보를 채소·과수·화훼 등의 9분야 164건에 대해서는 주요 농작업 일정 및 주요기술, 재배특성, 병해충 정보를 제공.  "
				, "content" 		: "<strong>구축 대상 : 10분야 , 177작목</strong>작목의 특성을 고려해 생산성을 향상 시킬 수 있도록 축산분야 13건은 주요작업, 사양관리, 방역관리 등의 정보를 채소·과수·화훼 등의 9분야 164건에 대해서는 주요 농작업 일정 및 주요기술, 재배특성, 병해충 정보를 제공. "
				, "click" 		: false
				, "link" 			: ""
			},
			{
				"name" 		: "농촌다움 100선"
				, "s_content" 	: "<농촌의 고유한 전통문화, 자연, 공동체 활동 등 고유의 전통성을 유지하면서 농촌다움을 자아내는 경관 2007년부터 매년 농촌어메니티자원조사 결과 중에서 전문가 심의를 거쳐 100선 선정 "
				, "content" 		: "<strong>주제 : </strong> <span>농촌의 고유한 전통문화, 자연, 공동체 활동 등 고유의 전통성을 유지하면서 농촌다움을 자아내는 경관 2007년부터 매년 농촌어메니티자원조사 결과 중에서 전문가 심의를 거쳐 100선 선정</span> <strong>농업생산경관 :</strong> 전통경작지, 경관작물재배지 등 농업생산 관련 경관 <strong>농촌자연경관(하천/해안) :</strong> 하천, 저수지, 호수, 해안 등의 수(水)경관 <strong>농촌자연경관(산림) :</strong> 자연산림, 마을숲, 정자나무 등 <strong>농촌주거지경관 :</strong> 테마마을, 건축물 및 부속물(담장, 돌담) 등 <strong>농촌역사문화경관 :</strong> 전통자원, 공동체활동 등 <strong>평가기준 :</strong> 자원의 활용가치, 경관자원으로서의 심미성, 고유성, 전통성, 지속성 <strong>전문가심의 위원:</strong> 농촌계획, 조경, 경관 관련 교수 및 전문가로 선정    * 매년 발간된 농촌어메니티 100選 책자는 발간도서란에서 e-book으로 제공하고 있음."
				, "click" 		: false
				, "link" 			: ""
			}


		],

		FNfind_index,
		insertModule,
		initModule
	;

	FNfind_index = function(_strID){
		for(var k=0 ; k<ARtooltipMSG.length; k++){
			if(ARtooltipMSG[k].name==_strID) return k
		}
	}

	insertModule = function(){
		var name=ARtooltipMSG[tooltip_index].name;
		var content=ARtooltipMSG[tooltip_index].content;
		$(".pop-area").find(".pop-tit").text(name);
		$(".pop-area").find(".tip-bx").html(String(content));
	}

	 initModule = function(){
		$items=$(".tooltip").each(function(i){

			var _this=$(this);
			var thisName=$(this).attr("data-name");
			_this.sindex=FNfind_index(thisName);
			_this.sname=ARtooltipMSG[_this.sindex].name;
			_this.slink=ARtooltipMSG[_this.sindex].link;
			_this.s_scontent=ARtooltipMSG[_this.sindex].s_content;
			_this.scontent=ARtooltipMSG[_this.sindex].content;
			_this.click=ARtooltipMSG[_this.sindex].click;

			//over
			var $item=$("a", $(this));
			$item.attr("title", _this.s_scontent);
			//$('.ui-tooltip div').html(_this.s_scontent)
			$item.tooltip({track: true});

			//click
			if(_this.click !=false){ //비계약 등록은 클릭팝업 없음
				$item.on("click", function(){
					tooltip_index=_this.sindex
					if( _this.slink =="" ) layerPop("../popup/tooltip_pop.html");//공통 툴팁 페이지
					else layerPop(_this.slink); //툴팁 링크페이지
				});
			}
		});
	}

	return{
		initModule : initModule
		, insertModule : insertModule
	}
})();



