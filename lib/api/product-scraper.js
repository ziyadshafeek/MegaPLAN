// Legacy compatibility endpoint. Listings now come from rights-cleared feeds
// through /api/product-directory; this endpoint never scrapes retailer HTML.
const FLIPKART = ['mobiles','laptops','televisions','electronics','home_appliances','mens_clothing','womens_clothing','books','beauty','toys','sports','automotive','grocery','furniture'];
const AMAZON = ['Electronics','Mobiles','Laptops','TV','Fashion','Home','Books','Beauty','Toys','Sports','Automotive','Grocery'];
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:'Read-only endpoint.'});
  const action=new URL(req.url,'https://megaplan.invalid').searchParams.get('action')||'categories';
  if(action==='categories')return json(res,200,{ok:true,platforms:{flipkart:{categories:FLIPKART},amazon:{categories:AMAZON}},source:'Static category names only, not inventory.'});
  if(action==='categories_list')return json(res,200,{ok:true,flipkart:FLIPKART.map(name=>({name})),amazon:AMAZON.map(name=>({name})),note:'Category names only; no verified product counts.'});
  if(['search','product'].includes(action))return json(res,501,{error:'Retailer HTML scraping is disabled. Search the verified /api/product-directory snapshot; new listings require an authorized retailer or affiliate feed.'});
  return json(res,400,{error:'Unknown action.'});
}
