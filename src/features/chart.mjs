import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([BarChart,LineChart,ScatterChart,GridComponent,TooltipComponent,LegendComponent,AriaComponent,SVGRenderer]);

export async function init(el, slide, state) {
  const chart = echarts.init(el,null,{renderer:'svg',width:1128,height:405});
  const render = (animate = !state.reduced && !state.printing) => {
    const t = state.theme.colors, c = slide.chart;
    chart.setOption({ animation:animate, animationDuration:550, color:state.theme.chart, backgroundColor:'transparent', textStyle:{fontFamily:state.font.family,fontSize:18,color:t.foreground}, aria:{enabled:true,decal:{show:true}}, tooltip:{trigger:'axis',renderMode:'richText'}, legend:{top:0,textStyle:{color:t.foreground,fontSize:17}}, grid:{top:55,bottom:55,left:80,right:20}, xAxis:{type:'category',data:c.labels,name:c.xLabel||'',nameLocation:'middle',nameGap:35,axisLabel:{color:t.muted,fontSize:17},axisLine:{lineStyle:{color:t.muted}},axisTick:{show:false}}, yAxis:{type:'value',name:c.unit,nameTextStyle:{color:t.muted,fontSize:16},axisLabel:{color:t.muted,fontSize:16},splitLine:{lineStyle:{color:t.muted,opacity:0.18}}},series:c.series.map(s=>({name:s.name,type:c.kind,data:s.values,barMaxWidth:52,symbolSize:12,lineStyle:{width:4},emphasis:{focus:'series'},itemStyle:{borderRadius:c.kind==='bar'?[4,4,0,0]:0}}))},true);
  };
  render();
  return {update:()=>render(false),freeze:()=>render(false),restore:()=>render(false)};
}
