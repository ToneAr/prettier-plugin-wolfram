// wstp-addon/wstp.cc
#include <napi.h>
#include <wstp.h>
#include <string>

// ---------------------------------------------------------------------------
// Async worker — runs WSPut/WSGet on the libuv thread pool
// ---------------------------------------------------------------------------
class EvaluateWorker : public Napi::AsyncWorker
{
public:
	EvaluateWorker(Napi::Function &callback, WSLINK link, std::string expr)
		: Napi::AsyncWorker(callback), link_(link), expr_(std::move(expr)) {}

	void Execute() override
	{
		// Send EvaluatePacket[ToExpression[expr]]
		if (!WSPutFunction(link_, "EvaluatePacket", 1))
		{
			SetError("WSPutFunction EvaluatePacket");
			return;
		}
		if (!WSPutFunction(link_, "ToExpression", 1))
		{
			SetError("WSPutFunction ToExpression");
			return;
		}
		if (!WSPutString(link_, expr_.c_str()))
		{
			SetError("WSPutString");
			return;
		}
		if (!WSEndPacket(link_))
		{
			SetError("WSEndPacket");
			return;
		}
		WSFlush(link_);

		// Skip until ReturnPacket
		int pkt;
		while ((pkt = WSNextPacket(link_)) != RETURNPKT)
		{
			if (pkt == ILLEGALPKT)
			{
				SetError("WSTP ILLEGALPKT");
				return;
			}
			WSNewPacket(link_);
		}

		// Retrieve string result
		const char *str = nullptr;
		if (!WSGetString(link_, &str))
		{
			WSNewPacket(link_);
			SetError("WSGetString failed — kernel did not return a String");
			return;
		}
		result_ = std::string(str);
		WSReleaseString(link_, str);
	}

	void OnOK() override
	{
		Napi::HandleScope scope(Env());
		Callback().Call({Env().Null(), Napi::String::New(Env(), result_)});
	}

	void OnError(const Napi::Error &e) override
	{
		Napi::HandleScope scope(Env());
		Callback().Call({e.Value()});
	}

private:
	WSLINK link_;
	std::string expr_;
	std::string result_;
};

// ---------------------------------------------------------------------------
// WSTPKernel class exposed to JS
// ---------------------------------------------------------------------------
class WSTPKernel : public Napi::ObjectWrap<WSTPKernel>
{
public:
	static Napi::Function GetClass(Napi::Env env)
	{
		return DefineClass(env, "WSTPKernel", {
												  InstanceMethod("launch", &WSTPKernel::Launch),
												  InstanceMethod("evaluate", &WSTPKernel::Evaluate),
												  InstanceMethod("close", &WSTPKernel::Close),
											  });
	}

	WSTPKernel(const Napi::CallbackInfo &info)
		: Napi::ObjectWrap<WSTPKernel>(info), wsenv_(nullptr), link_(nullptr) {}

	// launch(kernelExecutablePath: string): void
	Napi::Value Launch(const Napi::CallbackInfo &info)
	{
		Napi::Env env = info.Env();
		if (info.Length() < 1 || !info[0].IsString())
		{
			Napi::TypeError::New(env, "launch(kernelPath: string)").ThrowAsJavaScriptException();
			return env.Undefined();
		}
		std::string kernelPath = info[0].As<Napi::String>();

		wsenv_ = WSInitialize(nullptr);
		if (!wsenv_)
		{
			Napi::Error::New(env, "WSInitialize failed").ThrowAsJavaScriptException();
			return env.Undefined();
		}

		int err = WSEOK;
		std::string args = "-linkmode launch -linkname '" + kernelPath + " -wstp'";
		link_ = WSOpenString(wsenv_, args.c_str(), &err);
		if (!link_ || err != WSEOK)
		{
			WSDeinitialize(wsenv_);
			wsenv_ = nullptr;
			Napi::Error::New(env, "WSOpenString failed, code " + std::to_string(err))
				.ThrowAsJavaScriptException();
			return env.Undefined();
		}
		return env.Undefined();
	}

	// evaluate(expr: string, callback: (err, result: string) => void): void
	Napi::Value Evaluate(const Napi::CallbackInfo &info)
	{
		Napi::Env env = info.Env();
		if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction())
		{
			Napi::TypeError::New(env, "evaluate(expr: string, cb: Function)").ThrowAsJavaScriptException();
			return env.Undefined();
		}
		std::string expr = info[0].As<Napi::String>();
		Napi::Function cb = info[1].As<Napi::Function>();
		(new EvaluateWorker(cb, link_, std::move(expr)))->Queue();
		return env.Undefined();
	}

	// close(): void
	Napi::Value Close(const Napi::CallbackInfo &info)
	{
		if (link_)
		{
			WSClose(link_);
			link_ = nullptr;
		}
		if (wsenv_)
		{
			WSDeinitialize(wsenv_);
			wsenv_ = nullptr;
		}
		return info.Env().Undefined();
	}

private:
	WSENV wsenv_;
	WSLINK link_;
};

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
	exports.Set("WSTPKernel", WSTPKernel::GetClass(env));
	return exports;
}

NODE_API_MODULE(wstp, Init)
