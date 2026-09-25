"""Optional lightweight public-information / processing API.
Run separately from the static site. Heavy AI should be routed to a compatible
Hugging Face Space rather than done inside short-lived edge functions.
"""
from __future__ import annotations
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, HttpUrl
import socket, ssl, urllib.parse, urllib.request, json, re

app=FastAPI(title="FreeToolForge Services", version="0.2.0")

class URLIn(BaseModel):
    url: HttpUrl

@app.get("/health")
def health(): return {"ok":True,"service":"freetoolforge-services"}

@app.get("/dns")
def dns(host: str = Query(min_length=1,max_length=253)):
    host=host.strip().rstrip('.')
    try:
        infos=socket.getaddrinfo(host,None)
    except socket.gaierror as e:
        raise HTTPException(400,str(e))
    addrs=sorted({x[4][0] for x in infos})
    return {"host":host,"addresses":addrs}

@app.post("/url/inspect")
def inspect_url(body: URLIn):
    u=str(body.url)
    p=urllib.parse.urlparse(u)
    if p.scheme not in {"http","https"}: raise HTTPException(400,"Only HTTP(S) URLs are supported")
    req=urllib.request.Request(u,headers={"User-Agent":"FreeToolForge-PublicInspector/0.2"})
    try:
        with urllib.request.urlopen(req,timeout=8) as r:
            headers=dict(r.headers.items())
            sample=r.read(120_000).decode("utf-8","replace")
            title=re.search(r"<title[^>]*>(.*?)</title>",sample,re.I|re.S)
            return {"final_url":r.geturl(),"status":r.status,"content_type":headers.get("content-type"),"server":headers.get("server"),"title":re.sub(r"\s+"," ",title.group(1)).strip() if title else None}
    except Exception as e: raise HTTPException(400,f"Inspection failed: {e}")

@app.get("/tls")
def tls(host: str=Query(min_length=1,max_length=253),port:int=443):
    ctx=ssl.create_default_context()
    with socket.create_connection((host,port),timeout=8) as raw:
        with ctx.wrap_socket(raw,server_hostname=host) as s:
            cert=s.getpeercert()
            return {"host":host,"port":port,"tls":s.version(),"cipher":s.cipher()[0] if s.cipher() else None,"subject":cert.get("subject"),"issuer":cert.get("issuer"),"notBefore":cert.get("notBefore"),"notAfter":cert.get("notAfter")}

@app.get("/robots")
def robots(host: str=Query(min_length=1,max_length=253)):
    host=host.strip().rstrip('/')
    if not host.startswith("http"): host="https://"+host
    u=urllib.parse.urljoin(host+('/' if not host.endswith('/') else ''),"robots.txt")
    try:
        with urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"FreeToolForge-PublicInspector/0.2"}),timeout=8) as r:
            text=r.read(100_000).decode("utf-8","replace")
            return {"url":u,"status":r.status,"body":text}
    except Exception as e: raise HTTPException(400,f"robots.txt fetch failed: {e}")
