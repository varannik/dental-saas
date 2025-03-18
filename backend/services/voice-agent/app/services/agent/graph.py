import json
from typing import Dict, List, Optional, TypedDict, Annotated, Sequence, Literal
import uuid

from openai import AsyncOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolExecutor
from langgraph.checkpoint import MemorySaver
from langgraph.graph.message import AnyMessage
from langchain_core.messages import AIMessage, HumanMessage

from app.core.config import settings
from app.services.agent.tools import DentalTools

class AgentState(TypedDict):
    """
    State definition for the LangGraph agent
    """
    messages: Annotated[Sequence[AnyMessage], "Messages sent so far"]
    next: Annotated[Optional[str], "Next node to execute"]

class AgentGraph:
    """
    LangGraph implementation for the dental voice agent
    """
    def __init__(self):
        """
        Initialize the agent graph with tools and LLM
        """
        # Initialize OpenAI client
        self.openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        
        # Initialize dental tools
        self.dental_tools = DentalTools()
        
        # Define the tools for LangGraph
        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_patient_info",
                    "description": "Get information about a patient",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "patient_id": {
                                "type": "string",
                                "description": "The ID of the patient"
                            }
                        },
                        "required": ["patient_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_available_slots",
                    "description": "Get available appointment slots for a specific date",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format"
                            },
                            "service_type": {
                                "type": "string",
                                "description": "The type of service (e.g., Cleaning, Filling)"
                            }
                        },
                        "required": ["date", "service_type"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "schedule_appointment",
                    "description": "Schedule a new appointment",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "patient_id": {
                                "type": "string",
                                "description": "The ID of the patient"
                            },
                            "date": {
                                "type": "string",
                                "description": "The date in YYYY-MM-DD format"
                            },
                            "time": {
                                "type": "string",
                                "description": "The time in HH:MM format"
                            },
                            "service_type": {
                                "type": "string",
                                "description": "The type of service (e.g., Cleaning, Filling)"
                            }
                        },
                        "required": ["patient_id", "date", "time", "service_type"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_treatment_history",
                    "description": "Get treatment history for a patient",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "patient_id": {
                                "type": "string",
                                "description": "The ID of the patient"
                            }
                        },
                        "required": ["patient_id"]
                    }
                }
            }
        ]
        
        # Tool mapping for execution
        self.tool_executor_map = {
            "get_patient_info": self.dental_tools.get_patient_info,
            "get_available_slots": self.dental_tools.get_available_slots,
            "schedule_appointment": self.dental_tools.schedule_appointment,
            "get_treatment_history": self.dental_tools.get_treatment_history
        }
        
        # Create tool executor
        self.tool_executor = ToolExecutor(self.tool_executor_map)
        
        # Build the graph
        self.graph = self._build_agent_graph()
    
    async def agent(self, state: AgentState) -> AgentState:
        """
        LLM agent that decides what action to take next
        
        Args:
            state: Current agent state
            
        Returns:
            AgentState: Updated agent state
        """
        messages = state["messages"]
        
        llm_response = await self.openai_client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system", 
                    "content": """You are an AI assistant for a dental clinic. Your job is to help staff manage 
                    appointments, retrieve patient information, and assist with other administrative tasks.
                    Respond in a friendly, professional manner as if speaking to dental staff.
                    Keep your responses concise and focused on the task at hand."""
                },
                *[{"role": m.role.value, "content": m.content} for m in messages],
            ],
            tools=self.tools
        )
        
        response_message = llm_response.choices[0].message
        ai_message = AIMessage(content=response_message.content or "")
        
        # Check if the model wants to call a function
        if response_message.tool_calls:
            tool_call = response_message.tool_calls[0]
            ai_message = AIMessage(
                content=response_message.content or "",
                tool_calls=[{"name": tool_call.function.name, "arguments": tool_call.function.arguments}]
            )
            return {"messages": [*messages, ai_message], "next": "tool_executor"}
        
        # No tool calls, just return the response
        return {"messages": [*messages, ai_message], "next": END}
    
    async def tool_execution(self, state: AgentState) -> AgentState:
        """
        Execute tools based on the agent's decisions
        
        Args:
            state: Current agent state
            
        Returns:
            AgentState: Updated agent state
        """
        messages = state["messages"]
        last_message = messages[-1]
        
        # Extract the tool calls
        if not last_message.tool_calls:
            return {"messages": messages, "next": END}
        
        tool_call = last_message.tool_calls[0]
        name = tool_call["name"]
        arguments = json.loads(tool_call["arguments"])
        
        # Execute the tool
        try:
            result = await self.tool_executor.aexecute(name, arguments)
            tool_message = AIMessage(
                content="",
                tool_call_id=name,
                name=name,
                tool_calls=last_message.tool_calls,
                tool_results=result
            )
            return {"messages": [*messages, tool_message], "next": "agent"}
        except Exception as e:
            tool_message = AIMessage(
                content=f"Error executing tool {name}: {str(e)}",
                tool_call_id=name,
                name=name,
                tool_calls=last_message.tool_calls,
                tool_results={"error": str(e)}
            )
            return {"messages": [*messages, tool_message], "next": "agent"}
    
    def _build_agent_graph(self):
        """
        Build the LangGraph for the agent
        
        Returns:
            StateGraph: Compiled agent graph
        """
        workflow = StateGraph(AgentState)
        
        # Add nodes
        workflow.add_node("agent", self.agent)
        workflow.add_node("tool_executor", self.tool_execution)
        
        # Add edges
        workflow.add_edge("agent", "tool_executor")
        workflow.add_edge("tool_executor", "agent")
        
        # Set the entry point
        workflow.set_entry_point("agent")
        
        # Compile the graph
        memory = MemorySaver()
        return workflow.compile(checkpointer=memory)
    
    async def invoke(self, messages: List[Dict], session_id: Optional[str] = None) -> str:
        """
        Invoke the agent with a list of messages
        
        Args:
            messages: List of message dictionaries
            session_id: Optional session ID for tracking conversations
            
        Returns:
            str: Agent's response text
        """
        # Convert dict messages to LangGraph message objects
        lang_messages = []
        for msg in messages:
            if msg["role"] == "user":
                lang_messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                lang_messages.append(AIMessage(content=msg["content"]))
        
        # Execute the agent graph
        config = {"configurable": {"thread_id": session_id or str(uuid.uuid4())}}
        result = await self.graph.ainvoke({"messages": lang_messages, "next": None}, config=config)
        
        # Extract the final AI message
        final_message = next((m for m in reversed(result["messages"]) if isinstance(m, AIMessage) and m.content), None)
        if not final_message:
            return "I'm sorry, I couldn't generate a response at this time."
        
        return final_message.content 