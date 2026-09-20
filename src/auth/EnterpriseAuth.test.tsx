// @vitest-environment jsdom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach,afterEach,it,expect,vi } from "vitest";
const session=vi.hoisted(()=>({user:null as null|{role:string;firstName:string;lastName:string},loading:false,refresh:vi.fn()}));
vi.mock("../portal/AuthContext",()=>({usePortalAuth:()=>session}));
vi.mock("../core/firebase",()=>({auth:{}}));
vi.mock("firebase/auth",()=>({signInWithCustomToken:vi.fn()}));
vi.mock("../core/api",()=>({requestLoginCode:vi.fn(),verifyLoginCode:vi.fn(),updateCurrentUser:vi.fn()}));
import * as api from "../core/api";
import {signInWithCustomToken} from "firebase/auth";
import EnterpriseAuth from "./EnterpriseAuth";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.resetAllMocks();session.user=null;Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(<MemoryRouter><EnterpriseAuth/></MemoryRouter>));
const input=async(selector:string,value:string)=>{const el=host.querySelector<HTMLInputElement>(selector)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});};
const submit=()=>act(async()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
it("uses the same code flow for signup/signin without a password",async()=>{
 vi.mocked(api.requestLoginCode).mockResolvedValue({challengeId:"challenge"});vi.mocked(api.verifyLoginCode).mockResolvedValue({customToken:"verified-token"});
 await render();await input('input[type="email"]',"guest@example.com");await submit();expect(api.requestLoginCode).toHaveBeenCalledWith("guest@example.com");expect(host.textContent).toContain("Check your email");expect(host.querySelector('input[type="password"]')).toBeNull();await input('input[autocomplete="one-time-code"]',"123456");await submit();expect(api.verifyLoginCode).toHaveBeenCalledWith("challenge","123456");expect(signInWithCustomToken).toHaveBeenCalledWith({},"verified-token");
});
it("shows code errors without authenticating",async()=>{
 vi.mocked(api.requestLoginCode).mockRejectedValue(new Error("Please wait before requesting another code."));await render();await input('input[type="email"]',"guest@example.com");await submit();expect(host.querySelector('[role="alert"]')?.textContent).toContain("Please wait");expect(signInWithCustomToken).not.toHaveBeenCalled();
});
it("collects a verified new member's name before entering",async()=>{
 session.user={role:"member",firstName:"",lastName:""};await render();await input('input[autocomplete="given-name"]',"Sarah");await input('input[autocomplete="family-name"]',"Smith");await submit();expect(api.updateCurrentUser).toHaveBeenCalledWith("Sarah","Smith");expect(session.refresh).toHaveBeenCalled();
});
